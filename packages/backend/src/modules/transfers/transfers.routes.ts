import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const TransferSchema = z.object({
  employeeId: z.string().uuid(),
  type: z.enum(['transfer', 'promotion', 'demotion', 'acting', 'temporary_assignment']),
  fromCampusId: z.string().uuid(),
  toCampusId: z.string().uuid(),
  fromDepartmentId: z.string().uuid().optional(),
  toDepartmentId: z.string().uuid().optional(),
  fromJobTitle: z.string().max(200).optional(),
  toJobTitle: z.string().max(200).optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  reason: z.string().min(1),
  notes: z.string().optional(),
});

// GET /api/transfers?employeeId=
router.get('/', requirePermission('transfers', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let query = db('transfers')
        .join('employees as emp', 'transfers.employee_id', 'emp.id')
        .join('campuses as fc', 'transfers.from_campus_id', 'fc.id')
        .join('campuses as tc', 'transfers.to_campus_id', 'tc.id')
        .select(
          'transfers.*',
          db.raw("concat(emp.first_name, ' ', emp.last_name) as employee_name"),
          'emp.staff_no',
          'fc.name as from_campus_name',
          'tc.name as to_campus_name'
        )
        .orderBy('transfers.effective_date', 'desc');

      if (req.query.employeeId) query = query.where('transfers.employee_id', req.query.employeeId as string);
      if (req.query.status) query = query.where('transfers.status', req.query.status as string);

      const records = await query;
      res.json(records);
    } catch (err) { next(err); }
  }
);

// POST /api/transfers
router.post('/', requirePermission('transfers', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = TransferSchema.parse(req.body);
      const [transfer] = await db('transfers').insert({
        id: uuidv4(),
        employee_id: data.employeeId,
        type: data.type,
        status: 'pending',
        from_campus_id: data.fromCampusId,
        to_campus_id: data.toCampusId,
        from_department_id: data.fromDepartmentId,
        to_department_id: data.toDepartmentId,
        from_job_title: data.fromJobTitle,
        to_job_title: data.toJobTitle,
        effective_date: data.effectiveDate,
        end_date: data.endDate,
        reason: data.reason,
        notes: data.notes,
        recommended_by: req.user!.userId,
      }).returning('*');
      res.status(201).json(transfer);
    } catch (err) { next(err); }
  }
);

// PATCH /api/transfers/:id/approve
router.patch('/:id/approve', requirePermission('transfers', 'approve'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { action } = z.object({ action: z.enum(['approved', 'rejected']) }).parse(req.body);
      const [transfer] = await db('transfers')
        .where('id', req.params.id)
        .update({
          status: action,
          approved_by: req.user!.userId,
          approved_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');
      if (!transfer) throw new AppError(404, 'Transfer not found');
      res.json(transfer);
    } catch (err) { next(err); }
  }
);

export default router;
