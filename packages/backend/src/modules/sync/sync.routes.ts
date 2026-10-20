import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { authenticate, hasPermission } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

/**
 * Tables a device may mirror, and the permission needed to read each one.
 * Every table is filtered by the caller's role – sync must never hand out data
 * (salaries, documents, appraisals) the user couldn't read through the normal API.
 */
const SYNC_TABLES: Record<string, string> = {
  employees:          'staff_profiles:read',
  emergency_contacts: 'staff_profiles:read',
  education_records:  'staff_profiles:read',
  certifications:     'staff_profiles:read',
  employments:        'employment:read',
  salary_records:     'employment:read',
  transfers:          'transfers:read',
  appraisals:         'performance:read',
  kpis:               'performance:read',
  trainings:          'training:read',
  documents:          'documents:read',
};

const SyncBatchSchema = z.object({
  deviceId: z.string().min(1).max(100),
  lastSyncAt: z.string().datetime({ offset: true }),
  items: z.array(z.object({
    id: z.string().uuid(),
    table: z.string().max(64),
    recordId: z.string().max(100),
    operation: z.enum(['create', 'update', 'delete']),
    payload: z.record(z.unknown()),
  })).max(500),
});

// POST /api/sync  – device pushes local changes
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deviceId, lastSyncAt, items } = SyncBatchSchema.parse(req.body);

    // Register / update device
    const existing = await db('devices').where('id', deviceId).first();
    if (existing && existing.user_id && existing.user_id !== req.user!.userId) {
      return res.status(403).json({ message: 'Device is registered to another user' });
    }
    if (existing) {
      await db('devices').where('id', deviceId).update({ last_sync_at: new Date(), updated_at: new Date() });
    } else {
      await db('devices').insert({
        id: deviceId,
        user_id: req.user!.userId,
        platform: String(req.headers['x-platform'] || 'unknown').slice(0, 50),
        device_name: String(req.headers['x-device-name'] || 'Unknown Device').slice(0, 100),
        last_sync_at: new Date(),
      });
    }

    const accepted: string[] = [];
    const rejected: { id: string; reason: string }[] = [];

    // Process each item in the batch
    for (const item of items) {
      if (!Object.prototype.hasOwnProperty.call(SYNC_TABLES, item.table)) {
        rejected.push({ id: item.id, reason: 'Unknown table' });
        continue;
      }
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
      } catch {
        // Don't echo database error text (schema details) back to the client.
        rejected.push({ id: item.id, reason: 'Could not record change' });
      }
    }

    // Pull server updates since lastSyncAt
    const serverTimestamp = new Date().toISOString();
    const serverUpdates: Record<string, unknown[]> = {};
    for (const [table, perm] of Object.entries(SYNC_TABLES)) {
      if (!hasPermission(req.user, perm)) { serverUpdates[table] = []; continue; }
      serverUpdates[table] = await db(table)
        .where('updated_at', '>', lastSyncAt)
        .select('*');
    }

    res.json({ serverTimestamp, accepted, rejected, serverUpdates });
  } catch (err) { next(err); }
});

export default router;
