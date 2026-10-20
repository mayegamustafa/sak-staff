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
      monthlyJoined,
      monthlyLeft,
      activeStationsRow,
    ] = await Promise.all([
      db('employees').count('id as count').first(),
      db('employees').where('is_active', true).count('id as count').first(),
      db('employments')
        .join('campuses', 'employments.campus_id', 'campuses.id')
        .where('employments.status', 'active')
        .groupBy('campuses.name')
        .select('campuses.name', db.raw('COUNT(DISTINCT employments.employee_id) as count')),
      db('employments')
        .where('status', 'active')
        .groupBy('contract_type')
        .select('contract_type', db.raw('COUNT(DISTINCT employee_id) as count')),
      db('transfers').orderBy('created_at', 'desc').limit(5).select('*'),
      // Staff joined per month (last 12 months) — use employee created_at as proxy for joining
      db('employees')
        .whereRaw("created_at >= NOW() - INTERVAL '12 months'")
        .groupByRaw("TO_CHAR(created_at, 'YYYY-MM')")
        .select(db.raw("TO_CHAR(created_at, 'YYYY-MM') as month"), db.raw('COUNT(id) as count'))
        .orderBy('month', 'asc'),
      // Staff who left per month (last 12 months) — exit_date is on employees table
      db('employees')
        .whereNotNull('exit_date')
        .whereRaw("exit_date >= NOW() - INTERVAL '12 months'")
        .groupByRaw("TO_CHAR(exit_date, 'YYYY-MM')")
        .select(db.raw("TO_CHAR(exit_date, 'YYYY-MM') as month"), db.raw('COUNT(id) as count'))
        .orderBy('month', 'asc'),
      // Total active stations/campuses
      db('campuses').where('is_active', true).count('id as count').first(),
    ]);

    const totalStaff = (totalRow as any)?.count ?? 0;
    const activeStaff = (activeRow as any)?.count ?? 0;
    const activeStationsCount = Number((activeStationsRow as any)?.count ?? 0);
    res.json({ totalStaff, activeStaff, campusCounts, contractCounts, recentTransfers, monthlyJoined, monthlyLeft, activeStationsCount });
  } catch (err) { next(err); }
});

// GET /api/reports/staff-per-campus
router.get('/staff-per-campus', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await db('employments')
      .join('campuses', 'employments.campus_id', 'campuses.id')
      .where('employments.status', 'active')
      .groupBy('campuses.id', 'campuses.name', 'campuses.code')
      .select('campuses.id', 'campuses.name', 'campuses.code', db.raw('COUNT(DISTINCT employments.employee_id) as staff_count'))
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
    
    // New dynamic appraisals ranking (staff_appraisals table)
    let newQuery = db('staff_appraisals')
      .join('employees', 'staff_appraisals.staff_id', 'employees.id')
      .whereNotNull('staff_appraisals.annual_average')
      .select(
        db.raw("concat(employees.first_name, ' ', employees.last_name) as employee_name"),
        'employees.staff_no',
        db.raw('AVG(staff_appraisals.annual_average) as avg_score_pct'),
        db.raw('COUNT(staff_appraisals.id) as appraisal_count'),
        'staff_appraisals.annual_category as category_label',
      )
      .groupBy('employees.id', 'employees.first_name', 'employees.last_name', 'employees.staff_no', 'staff_appraisals.annual_category')
      .orderBy('avg_score_pct', 'desc');
    if (year) newQuery = newQuery.where('staff_appraisals.year', parseInt(year));

    // Legacy appraisals ranking (appraisals table)
    let legacyQuery = db('appraisals')
      .join('employees', 'appraisals.employee_id', 'employees.id')
      .select(
        db.raw("concat(employees.first_name, ' ', employees.last_name) as employee_name"),
        'employees.staff_no',
        db.raw('AVG(appraisals.overall_score) as avg_score'),
        db.raw('COUNT(appraisals.id) as appraisal_count')
      )
      .groupBy('employees.id', 'employees.first_name', 'employees.last_name', 'employees.staff_no')
      .orderBy('avg_score', 'desc');
    if (year) legacyQuery = legacyQuery.where('appraisals.academic_year', year);

    const [newRows, legacyRows] = await Promise.all([newQuery, legacyQuery]);
    
    // Prefer new system results; fall back to legacy if no new data
    if (newRows.length > 0) {
      res.json(newRows.map((r: any, i: number) => ({
        ...r,
        rank: i + 1,
        avg_score: r.avg_score_pct,
        system: 'dynamic',
      })));
    } else {
      res.json(legacyRows);
    }
  } catch (err) { next(err); }
});

export default router;
