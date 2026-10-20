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
        .leftJoin('users as approver', 'transfers.approved_by', 'approver.id')
        .leftJoin('departments as fd', 'transfers.from_department_id', 'fd.id')
        .leftJoin('departments as td', 'transfers.to_department_id', 'td.id')
        .select(
          'transfers.*',
          db.raw("concat(emp.first_name, ' ', emp.last_name) as employee_name"),
          'emp.staff_no',
          'emp.photo_path',
          'fc.name as from_campus_name',
          'tc.name as to_campus_name',
          'fd.name as from_department_name',
          'td.name as to_department_name',
          'approver.username as approver_name',
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

// PUT /api/transfers/:id  (edit a pending transfer)
router.put('/:id', requirePermission('transfers', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await db('transfers').where('id', req.params.id).first();
      if (!existing) throw new AppError(404, 'Transfer not found');
      const data = TransferSchema.parse(req.body);
      const [transfer] = await db('transfers')
        .where('id', req.params.id)
        .update({
          employee_id:        data.employeeId,
          type:               data.type,
          from_campus_id:     data.fromCampusId,
          to_campus_id:       data.toCampusId,
          from_department_id: data.fromDepartmentId ?? null,
          to_department_id:   data.toDepartmentId   ?? null,
          from_job_title:     data.fromJobTitle      ?? null,
          to_job_title:       data.toJobTitle        ?? null,
          effective_date:     data.effectiveDate,
          end_date:           data.endDate           ?? null,
          reason:             data.reason,
          notes:              data.notes             ?? null,
          updated_at:         new Date(),
        })
        .returning('*');
      res.json(transfer);
    } catch (err) { next(err); }
  }
);

// PATCH /api/transfers/:id/cancel  (withdraw a pending transfer)
router.patch('/:id/cancel', requirePermission('transfers', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await db('transfers').where('id', req.params.id).first();
      if (!existing) throw new AppError(404, 'Transfer not found');
      if (existing.status !== 'pending') throw new AppError(400, 'Only pending transfers can be cancelled');
      const [transfer] = await db('transfers')
        .where('id', req.params.id)
        .update({ status: 'cancelled', updated_at: new Date() })
        .returning('*');
      res.json(transfer);
    } catch (err) { next(err); }
  }
);

// PATCH /api/transfers/:id/approve
router.patch('/:id/approve', requirePermission('transfers', 'approve'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z.object({
        action:             z.enum(['approved', 'rejected']),
        approvalComment:    z.string().max(1000).optional(),
        approvalSignature:  z.string().optional(),
        approvalRole:       z.string().max(200).optional(),
        approvalDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }).parse(req.body);

      const [transfer] = await db('transfers')
        .where('id', req.params.id)
        .update({
          status:             body.action,
          approved_by:        req.user!.userId,
          approved_at:        new Date(),
          approval_comment:   body.approvalComment   ?? null,
          approval_signature: body.approvalSignature ?? null,
          approval_role:      body.approvalRole      ?? null,
          approval_date:      body.approvalDate      ?? null,
          updated_at:         new Date(),
        })
        .returning('*');
      if (!transfer) throw new AppError(404, 'Transfer not found');
      res.json(transfer);
    } catch (err) { next(err); }
  }
);

// DELETE /api/transfers/:id  –  permanently delete a transfer record
router.delete('/:id', requirePermission('transfers', 'delete'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await db('transfers').where('id', req.params.id).del();
      if (!deleted) throw new AppError(404, 'Transfer not found');
      res.status(204).end();
    } catch (err) { next(err); }
  }
);

export default router;
