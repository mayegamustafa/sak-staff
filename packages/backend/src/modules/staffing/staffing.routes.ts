import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

// ── GET /api/staffing/gaps ────────────────────────────────────────────────────
// Returns gap analysis per station, grouped for frontend display
router.get('/gaps', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Establishment records with filled counts (active employments matching job title text)
    const rows = await db('staffing_establishment as se')
      .join('campuses as c', 'c.id', 'se.campus_id')
      .join('job_titles as jt', 'jt.id', 'se.job_title_id')
      .leftJoin('employments as emp', function () {
        this.on('emp.campus_id', 'se.campus_id')
          .andOn('emp.job_title', 'jt.title')
          .andOnVal('emp.status', 'active');
      })
      .groupBy('se.id', 'c.id', 'c.name', 'c.code', 'jt.id', 'jt.title', 'jt.category', 'se.required_count')
      .select(
        'se.id as establishment_id',
        'c.id as campus_id',
        'c.name as campus_name',
        'c.code as campus_code',
        'jt.id as job_title_id',
        'jt.title as job_title',
        'jt.category',
        'se.required_count',
        db.raw('COUNT(DISTINCT emp.id)::int as filled'),
      )
      .orderBy(['c.name', 'jt.category', 'jt.title']);

    // Also fetch active staff whose job title has NO establishment record for that campus
    const unplanned = await db('employments as emp')
      .join('campuses as c', 'c.id', 'emp.campus_id')
      .leftJoin('job_titles as jt', 'jt.title', 'emp.job_title')
      .where('emp.status', 'active')
      .whereNotExists(
        db('staffing_establishment as se2')
          .join('job_titles as jt2', 'jt2.id', 'se2.job_title_id')
          .whereRaw('se2.campus_id = emp.campus_id')
          .whereRaw('jt2.title = emp.job_title'),
      )
      .groupBy('c.id', 'c.name', 'c.code', 'emp.job_title', 'jt.category', 'jt.id')
      .select(
        db.raw('NULL as establishment_id'),
        'c.id as campus_id',
        'c.name as campus_name',
        'c.code as campus_code',
        db.raw('jt.id as job_title_id'),
        'emp.job_title as job_title',
        db.raw("COALESCE(jt.category, 'teaching_staff') as category"),
        db.raw('0 as required_count'),
        db.raw('COUNT(emp.id)::int as filled'),
      )
      .orderBy(['c.name', 'emp.job_title']);

    const allRows = [...rows, ...unplanned];

    // Group by campus
    const campusMap = new Map<string, {
      campus_id: string; campus_name: string; campus_code: string;
      total_required: number; total_filled: number;
      items: object[];
    }>();

    for (const row of allRows) {
      if (!campusMap.has(row.campus_id)) {
        campusMap.set(row.campus_id, {
          campus_id: row.campus_id,
          campus_name: row.campus_name,
          campus_code: row.campus_code,
          total_required: 0,
          total_filled: 0,
          items: [],
        });
      }
      const campus = campusMap.get(row.campus_id)!;
      const required = Number(row.required_count) || 0;
      const filled   = Number(row.filled) || 0;
      campus.total_required += required;
      campus.total_filled   += filled;
      campus.items.push({
        establishment_id: row.establishment_id ?? null,
        job_title_id:     row.job_title_id ?? null,
        job_title:        row.job_title,
        category:         row.category,
        required,
        filled,
        gap: required - filled,
      });
    }

    res.json([...campusMap.values()].sort((a, b) => a.campus_name.localeCompare(b.campus_name)));
  } catch (err) { next(err); }
});

// ── GET /api/staffing/establishment ──────────────────────────────────────────
router.get('/establishment', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db('staffing_establishment as se')
      .join('campuses as c', 'c.id', 'se.campus_id')
      .join('job_titles as jt', 'jt.id', 'se.job_title_id')
      .select(
        'se.id', 'se.campus_id', 'se.job_title_id',
        'se.required_count', 'se.notes', 'se.created_at',
        'c.name as campus_name', 'c.code as campus_code',
        'jt.title as job_title', 'jt.category',
      )
      .orderBy(['c.name', 'jt.category', 'jt.title']);
    res.json(rows);
  } catch (err) { next(err); }
});

const EstSchema = z.object({
  campusId:     z.string().uuid(),
  jobTitleId:   z.string().uuid(),
  requiredCount: z.number().int().min(0).max(999),
  notes:        z.string().max(300).optional(),
});

// ── POST /api/staffing/establishment (upsert) ─────────────────────────────────
router.post(
  '/establishment',
  requirePermission('campus_management', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = EstSchema.parse(req.body);
      const existing = await db('staffing_establishment')
        .where({ campus_id: body.campusId, job_title_id: body.jobTitleId })
        .first();

      if (existing) {
        const [updated] = await db('staffing_establishment')
          .where({ id: existing.id })
          .update({ required_count: body.requiredCount, notes: body.notes ?? null, updated_at: db.fn.now() })
          .returning('*');
        return res.json(updated);
      }

      const [created] = await db('staffing_establishment')
        .insert({
          campus_id:      body.campusId,
          job_title_id:   body.jobTitleId,
          required_count: body.requiredCount,
          notes:          body.notes ?? null,
        })
        .returning('*');
      res.status(201).json(created);
    } catch (err) { next(err); }
  },
);

// ── PUT /api/staffing/establishment/:id ──────────────────────────────────────
router.put(
  '/establishment/:id',
  requirePermission('campus_management', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z.object({
        requiredCount: z.number().int().min(0).max(999),
        notes: z.string().max(300).optional(),
      }).parse(req.body);

      const [updated] = await db('staffing_establishment')
        .where({ id: req.params.id })
        .update({ required_count: body.requiredCount, notes: body.notes ?? null, updated_at: db.fn.now() })
        .returning('*');

      if (!updated) return res.status(404).json({ message: 'Record not found' });
      res.json(updated);
    } catch (err) { next(err); }
  },
);

// ── DELETE /api/staffing/establishment/:id ────────────────────────────────────
router.delete(
  '/establishment/:id',
  requirePermission('campus_management', 'delete'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await db('staffing_establishment').where({ id: req.params.id }).delete();
      res.status(204).end();
    } catch (err) { next(err); }
  },
);

export default router;
