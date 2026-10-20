import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

// ─── GET /api/academic-weeks?year=&term= ─────────────────────────────────────
// List week stubs for a given year / term (or all if no filters)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year, term } = req.query as Record<string, string>;
    let q = db('academic_weeks').orderBy(['year', 'term', 'week_number']);
    if (year) q = q.where('year', Number(year));
    if (term) q = q.where('term', term);
    res.json(await q);
  } catch (err) { next(err); }
});

// ─── POST /api/academic-weeks/generate ───────────────────────────────────────
// Auto-generate 13 week stubs for a year + term (idempotent via ON CONFLICT DO NOTHING)
const GenerateSchema = z.object({
  year: z.number().int().min(2020).max(2050),
  term: z.enum(['I', 'II', 'III']),
});

router.post(
  '/generate',
  requirePermission('reports', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { year, term } = GenerateSchema.parse(req.body);
      const rows = Array.from({ length: 13 }, (_, i) => ({
        id:          uuidv4(),
        year,
        term,
        week_number: i + 1,
        start_date:  null,
        end_date:    null,
        created_at:  new Date(),
        updated_at:  new Date(),
      }));

      // Insert, ignoring duplicates
      await db('academic_weeks')
        .insert(rows)
        .onConflict(['year', 'term', 'week_number'])
        .ignore();

      const created = await db('academic_weeks')
        .where({ year, term })
        .orderBy('week_number');
      res.status(201).json(created);
    } catch (err) { next(err); }
  },
);

// ─── PATCH /api/academic-weeks/:id ───────────────────────────────────────────
// Update start/end dates for a specific week
const UpdateSchema = z.object({
  start_date: z.string().nullable().optional(),
  end_date:   z.string().nullable().optional(),
});

router.patch(
  '/:id',
  requirePermission('reports', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = UpdateSchema.parse(req.body);
      const [updated] = await db('academic_weeks')
        .where('id', req.params.id)
        .update({ ...payload, updated_at: new Date() })
        .returning('*');
      if (!updated) return res.status(404).json({ message: 'Week not found' });
      res.json(updated);
    } catch (err) { next(err); }
  },
);

export default router;
