import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const ClassSchema = z.object({
  campusId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(30),
  level: z.enum(['kindergarten', 'primary']),
  displayOrder: z.number().int().default(0),
});

const StreamSchema = z.object({
  name: z.string().min(1).max(50),
  displayOrder: z.number().int().default(0),
});

// GET /api/classes?campusId=&level=
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let query = db('school_classes as sc')
      .leftJoin('campuses as c', 'sc.campus_id', 'c.id')
      .leftJoin('class_streams as cs', function () {
        this.on('cs.class_id', 'sc.id').andOn(db.raw('cs.is_active = true'));
      })
      .select(
        'sc.id', 'sc.campus_id', 'sc.name', 'sc.level',
        'sc.display_order', 'sc.is_active',
        'c.name as campus_name', 'c.code as campus_code',
        db.raw(`
          COALESCE(
            json_agg(
              json_build_object('id', cs.id, 'name', cs.name, 'display_order', cs.display_order,'is_active',cs.is_active)
              ORDER BY cs.display_order, cs.name
            ) FILTER (WHERE cs.id IS NOT NULL),
            '[]'
          ) as streams
        `)
      )
      .groupBy('sc.id', 'c.id')
      .orderBy(['sc.campus_id', 'sc.display_order', 'sc.name']);

    if (req.query.campusId) query = query.where('sc.campus_id', req.query.campusId as string);
    if (req.query.level) query = query.where('sc.level', req.query.level as string);

    const rows = await query;
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/classes
router.post('/', requirePermission('campus_management', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = ClassSchema.parse(req.body);
      const dup = await db('school_classes')
        .where({ campus_id: data.campusId ?? null, name: data.name })
        .first();
      if (dup) throw new AppError(409, 'A class with that name already exists at this station');
      const [row] = await db('school_classes').insert({
        id: uuidv4(),
        campus_id: data.campusId ?? null,
        name: data.name,
        level: data.level,
        display_order: data.displayOrder,
        is_active: true,
      }).returning('*');
      res.status(201).json({ ...row, streams: [] });
    } catch (err) { next(err); }
  }
);

// PUT /api/classes/:id
router.put('/:id', requirePermission('campus_management', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = ClassSchema.partial().parse(req.body);
      const existing = await db('school_classes').where('id', req.params.id).first();
      if (!existing) throw new AppError(404, 'Class not found');
      const [row] = await db('school_classes')
        .where('id', req.params.id)
        .update({
          campus_id: data.campusId !== undefined ? (data.campusId ?? null) : existing.campus_id,
          name: data.name ?? existing.name,
          level: data.level ?? existing.level,
          display_order: data.displayOrder ?? existing.display_order,
          updated_at: new Date(),
        })
        .returning('*');
      res.json(row);
    } catch (err) { next(err); }
  }
);

// PATCH /api/classes/:id/toggle-active
router.patch('/:id/toggle-active', requirePermission('campus_management', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const row = await db('school_classes').where('id', req.params.id).first();
      if (!row) throw new AppError(404, 'Class not found');
      await db('school_classes').where('id', req.params.id).update({ is_active: !row.is_active });
      res.json({ id: req.params.id, is_active: !row.is_active });
    } catch (err) { next(err); }
  }
);

// DELETE /api/classes/:id
router.delete('/:id', requirePermission('campus_management', 'delete'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await db('school_classes').where('id', req.params.id).del();
      if (!deleted) throw new AppError(404, 'Class not found');
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

// ── Streams ───────────────────────────────────────────────────────────────────

// POST /api/classes/:id/streams
router.post('/:id/streams', requirePermission('campus_management', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cls = await db('school_classes').where('id', req.params.id).first();
      if (!cls) throw new AppError(404, 'Class not found');
      const data = StreamSchema.parse(req.body);
      const dup = await db('class_streams')
        .whereRaw('LOWER(name) = ?', [data.name.toLowerCase()])
        .where('class_id', req.params.id)
        .first();
      if (dup) throw new AppError(409, 'Stream name already exists in this class');
      const [stream] = await db('class_streams').insert({
        id: uuidv4(),
        class_id: req.params.id,
        name: data.name,
        display_order: data.displayOrder,
        is_active: true,
      }).returning('*');
      res.status(201).json(stream);
    } catch (err) { next(err); }
  }
);

// DELETE /api/classes/streams/:streamId
router.delete('/streams/:streamId', requirePermission('campus_management', 'delete'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await db('class_streams').where('id', req.params.streamId).del();
      if (!deleted) throw new AppError(404, 'Stream not found');
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

export default router;
