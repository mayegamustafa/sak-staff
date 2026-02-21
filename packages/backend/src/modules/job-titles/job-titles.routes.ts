import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const JobTitleSchema = z.object({
  title:    z.string().min(2).max(200),
  payGrade: z.string().max(50).optional(),
  category: z.enum(['teaching_staff', 'non_teaching_professional', 'support_staff', 'administrator', 'manager']).optional(),
});

// GET /api/job-titles
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let query = db('job_titles').orderBy('category').orderBy('title');
    if (req.query.active === 'true')  query = query.where('is_active', true);
    if (req.query.category) query = query.where('category', req.query.category as string);
    res.json(await query);
  } catch (err) { next(err); }
});

// POST /api/job-titles
router.post('/', requirePermission('campus_management', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = JobTitleSchema.parse(req.body);
      const dupe = await db('job_titles').whereRaw('LOWER(title) = ?', [body.title.toLowerCase()]).first();
      if (dupe) throw new AppError(409, 'A job title with that name already exists');
      const [row] = await db('job_titles').insert({
        id: uuidv4(),
        title:     body.title,
        pay_grade: body.payGrade ?? null,
        category:  body.category ?? 'support_staff',
      }).returning('*');
      res.status(201).json(row);
    } catch (err) { next(err); }
  }
);

// PUT /api/job-titles/:id
router.put('/:id', requirePermission('campus_management', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = JobTitleSchema.parse(req.body);
      const existing = await db('job_titles').where('id', req.params.id).first();
      if (!existing) throw new AppError(404, 'Job title not found');
      const [row] = await db('job_titles').where('id', req.params.id).update({
        title:      body.title,
        pay_grade:  body.payGrade ?? null,
        category:   body.category ?? existing.category,
        updated_at: new Date(),
      }).returning('*');
      res.json(row);
    } catch (err) { next(err); }
  }
);

// PATCH /api/job-titles/:id/toggle-active
router.patch('/:id/toggle-active', requirePermission('campus_management', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const row = await db('job_titles').where('id', req.params.id).first();
      if (!row) throw new AppError(404, 'Job title not found');
      await db('job_titles').where('id', req.params.id).update({ is_active: !row.is_active, updated_at: new Date() });
      res.json({ id: req.params.id, is_active: !row.is_active });
    } catch (err) { next(err); }
  }
);

export default router;
