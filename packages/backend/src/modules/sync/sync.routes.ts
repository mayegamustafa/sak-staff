import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

const SyncBatchSchema = z.object({
  deviceId: z.string().min(1).max(100),
  lastSyncAt: z.string(),   // ISO timestamp
  items: z.array(z.object({
    id: z.string().uuid(),
    table: z.string(),
    recordId: z.string(),
    operation: z.enum(['create', 'update', 'delete']),
    payload: z.record(z.unknown()),
  })),
});

// POST /api/sync  – device pushes local changes
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deviceId, lastSyncAt, items } = SyncBatchSchema.parse(req.body);

    // Register / update device
    const existing = await db('devices').where('id', deviceId).first();
    if (existing) {
      await db('devices').where('id', deviceId).update({ last_sync_at: new Date(), updated_at: new Date() });
    } else {
      await db('devices').insert({
        id: deviceId,
        user_id: req.user!.userId,
        platform: req.headers['x-platform'] || 'unknown',
        device_name: req.headers['x-device-name'] || 'Unknown Device',
        last_sync_at: new Date(),
      });
    }

    const accepted: string[] = [];
    const rejected: { id: string; reason: string }[] = [];

    // Process each item in the batch
    for (const item of items) {
      try {
        await db('sync_queue').insert({
          id: item.id,
          table_name: item.table,
          record_id: item.recordId,
          operation: item.operation,
          payload: JSON.stringify(item.payload),
          device_id: deviceId,
          status: 'synced',
          synced_at: new Date(),
        }).onConflict('id').merge();
        accepted.push(item.id);
      } catch (err: unknown) {
        rejected.push({ id: item.id, reason: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    // Pull server updates since lastSyncAt
    const serverTimestamp = new Date().toISOString();
    const tables = [
      'employees', 'emergency_contacts', 'education_records', 'certifications',
      'employments', 'salary_records', 'transfers', 'appraisals', 'kpis',
      'trainings', 'documents',
    ] as const;

    const serverUpdates: Record<string, unknown[]> = {};
    for (const table of tables) {
      serverUpdates[table] = await db(table)
        .where('updated_at', '>', lastSyncAt)
        .select('*');
    }

    res.json({ serverTimestamp, accepted, rejected, serverUpdates });
  } catch (err) { next(err); }
});

export default router;
