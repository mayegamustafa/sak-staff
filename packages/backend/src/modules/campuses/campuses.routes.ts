import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const CampusSchema = z.object({
  name:    z.string().min(2).max(200),
  code:    z.string().min(1).max(30),
  address: z.string().max(500).optional(),
  phone:   z.string().max(30).optional(),
  email:   z.string().email().optional().or(z.literal('')),
});

const DepartmentSchema = z.object({
  name:     z.string().min(2).max(200),
  code:     z.string().min(1).max(30),
  campusId: z.string().uuid().optional().nullable(),
});

// ── CAMPUSES ──────────────────────────────────────────────────────────────────

// GET /api/campuses
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const campuses = await db('campuses')
      .leftJoin('employments', (join) =>
        join.on('campuses.id', 'employments.campus_id').andOn('employments.status', db.raw("'active'")))
      .groupBy('campuses.id')
      .select(
        'campuses.id', 'campuses.name', 'campuses.code',
        'campuses.address', 'campuses.phone', 'campuses.email',
        'campuses.is_active', 'campuses.created_at',
        db.raw('COUNT(employments.id) as staff_count'),
      )
      .orderBy('campuses.name');
    res.json(campuses);
  } catch (err) { next(err); }
});

// GET /api/campuses/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campus = await db('campuses').where('id', req.params.id).first();
    if (!campus) throw new AppError(404, 'Campus not found');
    const departments = await db('departments')
      .where('campus_id', req.params.id)
      .where('is_active', true)
      .select('id', 'name', 'code');
    res.json({ ...campus, departments });
  } catch (err) { next(err); }
});

// POST /api/campuses
router.post('/', requirePermission('campus_management', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = CampusSchema.parse(req.body);
      const existing = await db('campuses').where('code', data.code.toUpperCase()).first();
      if (existing) throw new AppError(409, `Campus code "${data.code}" already exists`);
      const [campus] = await db('campuses').insert({
        id: uuidv4(),
        name: data.name,
        code: data.code.toUpperCase(),
        address: data.address ?? null,
        phone: data.phone ?? null,
        email: data.email || null,
        is_active: true,
      }).returning(['id', 'name', 'code', 'address', 'phone', 'email', 'is_active', 'created_at']);
      res.status(201).json(campus);
    } catch (err) { next(err); }
  }
);

// PUT /api/campuses/:id
router.put('/:id', requirePermission('campus_management', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = CampusSchema.parse(req.body);
      const campus = await db('campuses').where('id', req.params.id).first();
      if (!campus) throw new AppError(404, 'Campus not found');
      const dup = await db('campuses')
        .where('code', data.code.toUpperCase())
        .whereNot('id', req.params.id)
        .first();
      if (dup) throw new AppError(409, `Campus code "${data.code}" already used by another campus`);
      const [updated] = await db('campuses')
        .where('id', req.params.id)
        .update({
          name: data.name,
          code: data.code.toUpperCase(),
          address: data.address ?? null,
          phone: data.phone ?? null,
          email: data.email || null,
        })
        .returning(['id', 'name', 'code', 'address', 'phone', 'email', 'is_active']);
      res.json(updated);
    } catch (err) { next(err); }
  }
);

// PATCH /api/campuses/:id/toggle-active
router.patch('/:id/toggle-active', requirePermission('campus_management', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campus = await db('campuses').where('id', req.params.id).first();
      if (!campus) throw new AppError(404, 'Campus not found');
      await db('campuses').where('id', req.params.id).update({ is_active: !campus.is_active });
      res.json({ id: req.params.id, is_active: !campus.is_active });
    } catch (err) { next(err); }
  }
);

// ── DEPARTMENTS ───────────────────────────────────────────────────────────────

// GET /api/campuses/departments/all  (all org-wide departments)
router.get('/departments/all', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db('departments')
      .select('id', 'name', 'code', 'campus_id', 'is_active')
      .orderBy('name');
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/campuses/departments
router.post('/departments', requirePermission('campus_management', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = DepartmentSchema.parse(req.body);
      const dup = await db('departments').whereRaw('LOWER(code) = ?', [data.code.toLowerCase()]).first();
      if (dup) throw new AppError(409, 'Department code already exists');
      const [dept] = await db('departments').insert({
        id: uuidv4(),
        name: data.name,
        code: data.code.toUpperCase(),
        campus_id: data.campusId ?? null,
        is_active: true,
      }).returning(['id', 'name', 'code', 'campus_id', 'is_active']);
      res.status(201).json(dept);
    } catch (err) { next(err); }
  }
);

// PUT /api/campuses/departments/:id
router.put('/departments/:id', requirePermission('campus_management', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = DepartmentSchema.parse(req.body);
      const dept = await db('departments').where('id', req.params.id).first();
      if (!dept) throw new AppError(404, 'Department not found');
      const dup = await db('departments')
        .whereRaw('LOWER(code) = ?', [data.code.toLowerCase()])
        .whereNot('id', req.params.id)
        .first();
      if (dup) throw new AppError(409, 'Department code already exists');
      const [updated] = await db('departments')
        .where('id', req.params.id)
        .update({ name: data.name, code: data.code.toUpperCase(), campus_id: data.campusId ?? null })
        .returning(['id', 'name', 'code', 'campus_id', 'is_active']);
      res.json(updated);
    } catch (err) { next(err); }
  }
);

// PATCH /api/campuses/departments/:id/toggle-active
router.patch('/departments/:id/toggle-active', requirePermission('campus_management', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dept = await db('departments').where('id', req.params.id).first();
      if (!dept) throw new AppError(404, 'Department not found');
      await db('departments').where('id', req.params.id).update({ is_active: !dept.is_active });
      res.json({ id: req.params.id, is_active: !dept.is_active });
    } catch (err) { next(err); }
  }
);

export default router;
