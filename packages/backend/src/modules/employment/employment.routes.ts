import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const EmploymentSchema = z.object({
  employeeId: z.string().uuid(),
  campusId: z.string().uuid(),
  departmentId: z.string().uuid(),
  jobTitle: z.string().min(1).max(200),
  payGrade: z.string().max(50).optional(),
  contractType: z.enum(['permanent', 'contract', 'probation', 'casual', 'internship']),
  status: z.enum(['active', 'on_leave', 'suspended', 'retired', 'resigned', 'terminated']).default('active'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().transform(v => v || new Date().toISOString().slice(0, 10)),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullish(),
  reportingToEmployeeId: z.string().uuid().optional(),
});

const SalarySchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default('UGX'),
  paymentFrequency: z.enum(['monthly', 'weekly', 'daily']).default('monthly'),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  reason: z.string().optional(),
});

// GET /api/employment/:employeeId
router.get('/:employeeId', requirePermission('employment', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const records = await db('employments')
        .join('campuses', 'employments.campus_id', 'campuses.id')
        .join('departments', 'employments.department_id', 'departments.id')
        .where('employments.employee_id', req.params.employeeId)
        .orderBy('employments.start_date', 'desc')
        .select(
          'employments.*',
          'campuses.name as campus_name',
          'departments.name as department_name'
        );

      // Attach salary history to each
      for (const r of records) {
        r.salaryHistory = await db('salary_records').where('employment_id', r.id).orderBy('effective_date', 'desc');
      }
      res.json(records);
    } catch (err) { next(err); }
  }
);

// POST /api/employment
router.post('/', requirePermission('employment', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = EmploymentSchema.parse(req.body);
      const [employment] = await db('employments').insert({
        id: uuidv4(),
        employee_id: data.employeeId,
        campus_id: data.campusId,
        department_id: data.departmentId,
        job_title: data.jobTitle,
        pay_grade: data.payGrade,
        contract_type: data.contractType,
        status: data.status,
        start_date: data.startDate,
        end_date: data.endDate,
        reporting_to_employee_id: data.reportingToEmployeeId,
      }).returning('*');
      res.status(201).json(employment);
    } catch (err) { next(err); }
  }
);
// PUT /api/employment/:id
router.put('/:id', requirePermission('employment', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const UpdateSchema = EmploymentSchema.partial().omit({ employeeId: true });
      const data = UpdateSchema.parse(req.body);
      const existing = await db('employments').where('id', req.params.id).first();
      if (!existing) throw new AppError(404, 'Employment record not found');
      const [updated] = await db('employments').where('id', req.params.id).update({
        campus_id:     data.campusId     ?? existing.campus_id,
        department_id: data.departmentId ?? existing.department_id,
        job_title:     data.jobTitle     ?? existing.job_title,
        pay_grade:     data.payGrade     !== undefined ? data.payGrade : existing.pay_grade,
        contract_type: data.contractType ?? existing.contract_type,
        status:        data.status       ?? existing.status,
        start_date:    data.startDate    ?? existing.start_date,
        end_date:      data.endDate      !== undefined ? data.endDate : existing.end_date,
        updated_at:    db.fn.now(),
      }).returning('*');
      res.json(updated);
    } catch (err) { next(err); }
  }
);
// PUT /api/employment/:id
router.put('/:id', requirePermission('employment', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const UpdateSchema = EmploymentSchema.partial().omit({ employeeId: true });
      const data = UpdateSchema.parse(req.body);
      const existing = await db('employments').where('id', req.params.id).first();
      if (!existing) throw new AppError(404, 'Employment record not found');
      const [updated] = await db('employments').where('id', req.params.id).update({
        campus_id:     data.campusId     ?? existing.campus_id,
        department_id: data.departmentId ?? existing.department_id,
        job_title:     data.jobTitle     ?? existing.job_title,
        pay_grade:     data.payGrade     !== undefined ? data.payGrade : existing.pay_grade,
        contract_type: data.contractType ?? existing.contract_type,
        status:        data.status       ?? existing.status,
        start_date:    data.startDate    ?? existing.start_date,
        end_date:      data.endDate      !== undefined ? data.endDate : existing.end_date,
        updated_at: db.fn.now(),
      }).returning('*');
      res.json(updated);
    } catch (err) { next(err); }
  }
);

// POST /api/employment/:id/salary
router.post('/:id/salary', requirePermission('employment', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = SalarySchema.parse(req.body);
      const emp = await db('employments').where('id', req.params.id).first();
      if (!emp) throw new AppError(404, 'Employment record not found');

      const [salary] = await db('salary_records').insert({
        id: uuidv4(),
        employment_id: req.params.id,
        amount: data.amount,
        currency: data.currency,
        payment_frequency: data.paymentFrequency,
        effective_date: data.effectiveDate,
        reason: data.reason,
        approved_by: req.user!.userId,
      }).returning('*');
      res.status(201).json(salary);
    } catch (err) { next(err); }
  }
);

export default router;
