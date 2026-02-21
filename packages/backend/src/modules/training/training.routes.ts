import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const TrainingSchema = z.object({
  employeeId: z.string().uuid(),
  title: z.string().min(1).max(300),
  type: z.enum(['workshop', 'seminar', 'course', 'conference', 'on_the_job', 'online']),
  provider: z.string().min(1).max(300),
  venue: z.string().max(300).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  durationDays: z.number().int().positive(),
  skills: z.array(z.string()).default([]),
  cost: z.number().positive().optional(),
  currency: z.string().default('UGX'),
  paymentBy: z.enum(['employer', 'employee', 'sponsored']).optional(),
  notes: z.string().optional(),
});

// GET /api/training?employeeId=
router.get('/', requirePermission('training', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let query = db('trainings').orderBy('start_date', 'desc');
      if (req.query.employeeId) query = query.where('employee_id', req.query.employeeId as string);
      res.json(await query);
    } catch (err) { next(err); }
  }
);

// GET /api/training/:id
router.get('/:id', requirePermission('training', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const record = await db('trainings').where('id', req.params.id).first();
      if (!record) throw new AppError(404, 'Training record not found');
      res.json(record);
    } catch (err) { next(err); }
  }
);

// POST /api/training
router.post('/', requirePermission('training', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = TrainingSchema.parse(req.body);
      const [record] = await db('trainings').insert({
        id: uuidv4(),
        employee_id: data.employeeId,
        title: data.title,
        type: data.type,
        provider: data.provider,
        venue: data.venue,
        start_date: data.startDate,
        end_date: data.endDate,
        duration_days: data.durationDays,
        skills: data.skills,
        cost: data.cost,
        currency: data.currency,
        payment_by: data.paymentBy,
        notes: data.notes,
      }).returning('*');
      res.status(201).json(record);
    } catch (err) { next(err); }
  }
);

// PUT /api/training/:id
router.put('/:id', requirePermission('training', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = TrainingSchema.partial().parse(req.body);
      const [record] = await db('trainings')
        .where('id', req.params.id)
        .update({ ...data, updated_at: new Date() })
        .returning('*');
      if (!record) throw new AppError(404, 'Training record not found');
      res.json(record);
    } catch (err) { next(err); }
  }
);

// DELETE /api/training/:id
router.delete('/:id', requirePermission('training', 'delete'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await db('trainings').where('id', req.params.id).del();
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

export default router;
