import { Router, Request, Response, NextFunction } from 'express';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';

const router = Router();
router.use(authenticate);
router.use(requirePermission('reports', 'read'));

// GET /api/reports/summary  – dashboard KPIs
router.get('/summary', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      totalRow,
      activeRow,
      campusCounts,
      contractCounts,
      recentTransfers,
    ] = await Promise.all([
      db('employees').count('id as count').first(),
      db('employees').where('is_active', true).count('id as count').first(),
      db('employments')
        .join('campuses', 'employments.campus_id', 'campuses.id')
        .where('employments.status', 'active')
        .groupBy('campuses.name')
        .select('campuses.name', db.raw('count(*) as count')),
      db('employments')
        .where('status', 'active')
        .groupBy('contract_type')
        .select('contract_type', db.raw('count(*) as count')),
      db('transfers').orderBy('created_at', 'desc').limit(5).select('*'),
    ]);

    const totalStaff = (totalRow as any)?.count ?? 0;
    const activeStaff = (activeRow as any)?.count ?? 0;
    res.json({ totalStaff, activeStaff, campusCounts, contractCounts, recentTransfers });
  } catch (err) { next(err); }
});

// GET /api/reports/staff-per-campus
router.get('/staff-per-campus', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await db('employments')
      .join('campuses', 'employments.campus_id', 'campuses.id')
      .where('employments.status', 'active')
      .groupBy('campuses.id', 'campuses.name', 'campuses.code')
      .select('campuses.id', 'campuses.name', 'campuses.code', db.raw('count(*) as staff_count'))
      .orderBy('staff_count', 'desc');
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/reports/transfers-history?year=2025
router.get('/transfers-history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const year = req.query.year as string;
    let query = db('transfers')
      .join('employees', 'transfers.employee_id', 'employees.id')
      .join('campuses as fc', 'transfers.from_campus_id', 'fc.id')
      .join('campuses as tc', 'transfers.to_campus_id', 'tc.id')
      .select(
        'transfers.id', 'transfers.type', 'transfers.status',
        'transfers.effective_date', 'transfers.reason',
        db.raw("concat(employees.first_name, ' ', employees.last_name) as employee_name"),
        'employees.staff_no',
        'fc.name as from_campus', 'tc.name as to_campus'
      )
      .orderBy('transfers.effective_date', 'desc');
    if (year) query = query.whereRaw('EXTRACT(YEAR FROM transfers.effective_date) = ?', [year]);
    res.json(await query);
  } catch (err) { next(err); }
});

// GET /api/reports/performance-ranking?academicYear=2025/2026
router.get('/performance-ranking', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const year = req.query.academicYear as string;
    let query = db('appraisals')
      .join('employees', 'appraisals.employee_id', 'employees.id')
      .select(
        db.raw("concat(employees.first_name, ' ', employees.last_name) as employee_name"),
        'employees.staff_no',
        db.raw('AVG(appraisals.overall_score) as avg_score'),
        db.raw('COUNT(appraisals.id) as appraisal_count')
      )
      .groupBy('employees.id', 'employees.first_name', 'employees.last_name', 'employees.staff_no')
      .orderBy('avg_score', 'desc');
    if (year) query = query.where('appraisals.academic_year', year);
    res.json(await query);
  } catch (err) { next(err); }
});

export default router;
