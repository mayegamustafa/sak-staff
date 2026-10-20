import { Router, Request, Response, NextFunction } from 'express';
import db from '../../db';
import { authenticate, requireAnyPermission } from '../../middleware/auth';

const router = Router();
router.use(authenticate);
// Staff-level performance and attendance figures – not for every logged-in role.
router.use(requireAnyPermission('reports:read', 'performance:read', 'attendance:read'));

// ─── helpers ────────────────────────────────────────────────────────────────
function computeExpected(weeks: number, schoolType: string): number {
  return weeks * (schoolType.toLowerCase() === 'boarding' ? 7 : 6);
}

// Resolve filters used by several endpoints
function parseFilters(query: Record<string, any>) {
  const year    = query.year    ? Number(query.year)          : null;
  const term    = query.term    ? String(query.term)          : null;
  const campusId = query.campusId ? String(query.campusId)   : null;
  const staffId  = query.staffId  ? String(query.staffId)    : null;
  return { year, term, campusId, staffId };
}

// ─── GET /api/analytics/overview ────────────────────────────────────────────
// Summary cards: avg performance, avg attendance, best/worst campus, total staff
router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year, term, campusId } = parseFilters(req.query as any);

    // ── performance ──────────────────────────────────────────────────────────
    let perfQ = db('staff_appraisals as sa')
      .join('employments as em', 'em.employee_id', 'sa.staff_id')
      .whereNotNull('sa.annual_average');
    if (year)     perfQ = perfQ.where('sa.year', year);
    if (campusId) perfQ = perfQ.where('em.campus_id', campusId);
    if (term) {
      perfQ = perfQ
        .join('staff_appraisal_terms as sat', 'sat.appraisal_id', 'sa.id')
        .where('sat.term', term);
    }
    const perfRows = await perfQ.select(
      db.raw('AVG(sa.annual_average) as avg_perf'),
      db.raw('COUNT(DISTINCT sa.staff_id) as staff_count'),
    ).first();

    // ── attendance ───────────────────────────────────────────────────────────
    let attQ = db('staff_attendance as att')
      .join('employments as em2', 'em2.employee_id', 'att.employee_id');
    if (year)     attQ = attQ.where('att.year', year);
    if (term)     attQ = attQ.where('att.term', term);
    if (campusId) attQ = attQ.where('em2.campus_id', campusId);
    const attRows = await attQ.select('att.weeks', 'att.school_type', 'att.days_present');
    let totalExpected = 0, totalPresent = 0;
    for (const r of attRows) {
      totalExpected += computeExpected(r.weeks, r.school_type);
      totalPresent  += Number(r.days_present);
    }
    const avgAttendance = totalExpected > 0 ? (totalPresent / totalExpected) * 100 : null;

    // ── best / worst campus by performance ───────────────────────────────────
    let campusPerfQ = db('staff_appraisals as sa')
      .join('employments as em3', 'em3.employee_id', 'sa.staff_id')
      .join('campuses as c', 'c.id', 'em3.campus_id')
      .whereNotNull('sa.annual_average');
    if (year) campusPerfQ = campusPerfQ.where('sa.year', year);
    if (term) {
      campusPerfQ = campusPerfQ
        .join('staff_appraisal_terms as sat2', 'sat2.appraisal_id', 'sa.id')
        .where('sat2.term', term);
    }
    const campusPerf = await campusPerfQ
      .groupBy('c.id', 'c.name')
      .select('c.id as campus_id', 'c.name as campus_name', db.raw('AVG(sa.annual_average) as avg_perf'))
      .orderBy('avg_perf', 'desc');

    // ── best / worst campus by attendance ────────────────────────────────────
    let campusAttQ = db('staff_attendance as att2')
      .join('employments as em4', 'em4.employee_id', 'att2.employee_id')
      .join('campuses as c2', 'c2.id', 'em4.campus_id');
    if (year) campusAttQ = campusAttQ.where('att2.year', year);
    if (term) campusAttQ = campusAttQ.where('att2.term', term);
    const campusAttRows = await campusAttQ
      .select('c2.id as campus_id', 'c2.name as campus_name', 'att2.weeks', 'att2.school_type', 'att2.days_present');

    const campusAttMap: Record<string, { name: string; expected: number; present: number }> = {};
    for (const r of campusAttRows) {
      if (!campusAttMap[r.campus_id]) campusAttMap[r.campus_id] = { name: r.campus_name, expected: 0, present: 0 };
      campusAttMap[r.campus_id].expected += computeExpected(r.weeks, r.school_type);
      campusAttMap[r.campus_id].present  += Number(r.days_present);
    }
    const campusAttSorted = Object.entries(campusAttMap)
      .map(([id, v]) => ({ campus_id: id, campus_name: v.name, avg_att: v.expected > 0 ? (v.present / v.expected) * 100 : 0 }))
      .sort((a, b) => b.avg_att - a.avg_att);

    res.json({
      avgPerformance: perfRows?.avg_perf ? Number(Number(perfRows.avg_perf).toFixed(2)) : null,
      avgAttendance:  avgAttendance       ? Number(avgAttendance.toFixed(2))             : null,
      totalStaffEvaluated: Number(perfRows?.staff_count ?? 0),
      bestCampusPerf:  campusPerf[0]         ?? null,
      worstCampusPerf: campusPerf[campusPerf.length - 1] ?? null,
      bestCampusAtt:   campusAttSorted[0]    ?? null,
      worstCampusAtt:  campusAttSorted[campusAttSorted.length - 1] ?? null,
    });
  } catch (err) { next(err); }
});

// ─── GET /api/analytics/stations ────────────────────────────────────────────
// Per-campus aggregated performance + attendance
router.get('/stations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year, term } = parseFilters(req.query as any);

    // Performance per campus
    let perfQ = db('staff_appraisals as sa')
      .join('employments as em', 'em.employee_id', 'sa.staff_id')
      .join('campuses as c', 'c.id', 'em.campus_id')
      .whereNotNull('sa.annual_average');
    if (year) perfQ = perfQ.where('sa.year', year);
    if (term) {
      perfQ = perfQ
        .join('staff_appraisal_terms as sat', 'sat.appraisal_id', 'sa.id')
        .where('sat.term', term);
    }
    const perfRows = await perfQ
      .groupBy('c.id', 'c.name', 'c.code')
      .select(
        'c.id as campus_id',
        'c.name as campus_name',
        'c.code as campus_code',
        db.raw('AVG(sa.annual_average) as avg_perf'),
        db.raw('COUNT(DISTINCT sa.staff_id) as staff_evaluated'),
      );

    // Attendance per campus
    let attQ = db('staff_attendance as att')
      .join('employments as em2', 'em2.employee_id', 'att.employee_id')
      .join('campuses as c2', 'c2.id', 'em2.campus_id');
    if (year) attQ = attQ.where('att.year', year);
    if (term) attQ = attQ.where('att.term', term);
    const attRows = await attQ
      .select('c2.id as campus_id', 'att.weeks', 'att.school_type', 'att.days_present');

    // Build attendance map
    const attMap: Record<string, { expected: number; present: number }> = {};
    for (const r of attRows) {
      if (!attMap[r.campus_id]) attMap[r.campus_id] = { expected: 0, present: 0 };
      attMap[r.campus_id].expected += computeExpected(r.weeks, r.school_type);
      attMap[r.campus_id].present  += Number(r.days_present);
    }

    // All campuses (even those with no data)
    const campuses = await db('campuses').where('is_active', true).select('id', 'name', 'code').orderBy('name');

    const result = campuses.map((camp: any) => {
      const perf = perfRows.find((r: any) => r.campus_id === camp.id);
      const att  = attMap[camp.id];
      return {
        campus_id:   camp.id,
        campus_name: camp.name,
        campus_code: camp.code,
        avg_perf:    perf ? Number(Number(perf.avg_perf).toFixed(2)) : null,
        avg_att:     att && att.expected > 0 ? Number(((att.present / att.expected) * 100).toFixed(2)) : null,
        staff_evaluated: perf ? Number(perf.staff_evaluated) : 0,
        total_absent_days: att ? (att.expected - att.present) : 0,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

// ─── GET /api/analytics/staff ────────────────────────────────────────────────
// Per-staff performance + attendance + category
router.get('/staff', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year, term, campusId, staffId } = parseFilters(req.query as any);

    let perfQ = db('staff_appraisals as sa')
      .join('employees as e', 'e.id', 'sa.staff_id')
      .join('employments as em', 'em.employee_id', 'sa.staff_id')
      .join('campuses as c', 'c.id', 'em.campus_id')
      .whereNotNull('sa.annual_average');
    if (year)     perfQ = perfQ.where('sa.year', year);
    if (campusId) perfQ = perfQ.where('em.campus_id', campusId);
    if (staffId)  perfQ = perfQ.where('sa.staff_id', staffId);
    if (term) {
      perfQ = perfQ
        .join('staff_appraisal_terms as sat', 'sat.appraisal_id', 'sa.id')
        .where('sat.term', term);
    }
    const perfRows = await perfQ.select(
      'sa.staff_id',
      'sa.annual_average',
      'sa.annual_category',
      'sa.year',
      db.raw("concat(e.first_name, ' ', e.last_name) as employee_name"),
      'e.staff_no',
      'c.id as campus_id',
      'c.name as campus_name',
    );

    // Fetch attendance for each staff id
    const staffIds = [...new Set(perfRows.map((r: any) => r.staff_id))];
    let attQ = db('staff_attendance as att').whereIn('att.employee_id', staffIds as string[]);
    if (year) attQ = attQ.where('att.year', year);
    if (term) attQ = attQ.where('att.term', term);
    const attRows = await attQ.select('att.employee_id', 'att.weeks', 'att.school_type', 'att.days_present');

    const attMap: Record<string, { expected: number; present: number }> = {};
    for (const r of attRows) {
      if (!attMap[r.employee_id]) attMap[r.employee_id] = { expected: 0, present: 0 };
      attMap[r.employee_id].expected += computeExpected(r.weeks, r.school_type);
      attMap[r.employee_id].present  += Number(r.days_present);
    }

    const result = perfRows.map((r: any) => {
      const att = attMap[r.staff_id];
      const attPct = att && att.expected > 0 ? (att.present / att.expected) * 100 : null;
      const perfPct = Number(r.annual_average);
      let category = '';
      if (attPct !== null) {
        if (perfPct >= 80 && attPct >= 85) category = 'HIGH_PERF_HIGH_ATT';
        else if (perfPct >= 80 && (attPct !== null && attPct < 75)) category = 'HIGH_PERF_LOW_ATT';
        else if (perfPct < 60 && (attPct !== null && attPct >= 85)) category = 'LOW_PERF_HIGH_ATT';
        else if (perfPct < 60 && (attPct !== null && attPct < 75)) category = 'LOW_PERF_LOW_ATT';
        else category = 'AVERAGE';
      }
      return {
        staff_id:        r.staff_id,
        employee_name:   r.employee_name,
        staff_no:        r.staff_no,
        campus_id:       r.campus_id,
        campus_name:     r.campus_name,
        year:            r.year,
        performance_pct: perfPct,
        performance_cat: r.annual_category,
        attendance_pct:  attPct !== null ? Number(attPct.toFixed(2)) : null,
        category,
        alert_low_perf:  perfPct < 60,
        alert_low_att:   attPct !== null && attPct < 75,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

// ─── GET /api/analytics/attendance ───────────────────────────────────────────
// Attendance details: absence reasons breakdown, per-campus stats
router.get('/attendance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year, term, campusId } = parseFilters(req.query as any);

    // Absence reasons breakdown
    let reasonsQ = db('staff_attendance_absences as abs')
      .join('staff_attendance as att', 'att.id', 'abs.attendance_id');
    if (year)     reasonsQ = reasonsQ.where('att.year', year);
    if (term)     reasonsQ = reasonsQ.where('att.term', term);
    if (campusId) {
      reasonsQ = reasonsQ
        .join('employments as em', 'em.employee_id', 'att.employee_id')
        .where('em.campus_id', campusId);
    }
    const reasons = await reasonsQ
      .groupBy('abs.reason')
      .select('abs.reason', db.raw('SUM(abs.days) as total_days'), db.raw('COUNT(*) as occurrences'))
      .orderBy('total_days', 'desc');

    // Per campus attendance
    let campusQ = db('staff_attendance as att')
      .join('employments as em2', 'em2.employee_id', 'att.employee_id')
      .join('campuses as c', 'c.id', 'em2.campus_id');
    if (year)     campusQ = campusQ.where('att.year', year);
    if (term)     campusQ = campusQ.where('att.term', term);
    if (campusId) campusQ = campusQ.where('em2.campus_id', campusId);
    const campusAtt = await campusQ.select('c.id as campus_id', 'c.name as campus_name', 'att.weeks', 'att.school_type', 'att.days_present');

    const campusMap: Record<string, { name: string; expected: number; present: number; staff: Set<string> }> = {};
    for (const r of campusAtt) {
      if (!campusMap[r.campus_id]) campusMap[r.campus_id] = { name: r.campus_name, expected: 0, present: 0, staff: new Set() };
      campusMap[r.campus_id].expected += computeExpected(r.weeks, r.school_type);
      campusMap[r.campus_id].present  += Number(r.days_present);
    }

    const campusStats = Object.entries(campusMap).map(([id, v]) => ({
      campus_id:         id,
      campus_name:       v.name,
      avg_attendance_pct: v.expected > 0 ? Number(((v.present / v.expected) * 100).toFixed(2)) : null,
      total_absent_days: v.expected - v.present,
      total_expected_days: v.expected,
    })).sort((a, b) => (b.avg_attendance_pct ?? 0) - (a.avg_attendance_pct ?? 0));

    res.json({ reasons, campusStats });
  } catch (err) { next(err); }
});

// ─── GET /api/analytics/trends ───────────────────────────────────────────────
// Per-term trend lines for performance and attendance
router.get('/trends', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year, campusId } = parseFilters(req.query as any);

    // Performance trend: group by year + term
    let perfQ = db('staff_appraisal_terms as sat')
      .join('staff_appraisals as sa', 'sa.id', 'sat.appraisal_id')
      .join('employments as em', 'em.employee_id', 'sa.staff_id');
    if (year)     perfQ = perfQ.where('sa.year', year);
    if (campusId) perfQ = perfQ.where('em.campus_id', campusId);
    const perfTrend = await perfQ
      .groupBy('sa.year', 'sat.term')
      .select(
        'sa.year',
        'sat.term',
        db.raw('AVG(sat.term_score) as avg_score'),
        db.raw('COUNT(DISTINCT sa.staff_id) as staff_count'),
      )
      .orderBy('sa.year').orderByRaw("CASE sat.term WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 END");

    // Attendance trend: group by year + term
    let attQ = db('staff_attendance as att')
      .join('employments as em2', 'em2.employee_id', 'att.employee_id');
    if (year)     attQ = attQ.where('att.year', year);
    if (campusId) attQ = attQ.where('em2.campus_id', campusId);
    const attRaw = await attQ
      .groupBy('att.year', 'att.term')
      .select(
        'att.year',
        'att.term',
        db.raw('SUM(att.days_present) as total_present'),
        db.raw('SUM(att.weeks * CASE WHEN LOWER(att.school_type) = \'boarding\' THEN 7 ELSE 6 END) as total_expected'),
      )
      .orderBy('att.year').orderByRaw("CASE att.term WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 END");

    const attTrend = attRaw.map((r: any) => ({
      year:  r.year,
      term:  r.term,
      avg_attendance_pct: r.total_expected > 0
        ? Number(((Number(r.total_present) / Number(r.total_expected)) * 100).toFixed(2))
        : null,
    }));

    res.json({
      performance: perfTrend.map((r: any) => ({
        year: r.year,
        term: r.term,
        avg_score:   Number(Number(r.avg_score).toFixed(2)),
        staff_count: Number(r.staff_count),
        label: `${r.year} T${r.term}`,
      })),
      attendance: attTrend.map((r: any) => ({ ...r, label: `${r.year} T${r.term}` })),
    });
  } catch (err) { next(err); }
});

// ─── GET /api/analytics/absent-by-station ────────────────────────────────────
// Staff grouped by campus who have absence records, with reason detail.
// Params: year, term, campusId, weekNumber
router.get('/absent-by-station', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year, term, campusId } = parseFilters(req.query as any);
    const weekNumber = req.query.weekNumber ? Number(req.query.weekNumber) : null;

    // Base query: join absences → attendance → employees → employments → campuses
    let q = db('staff_attendance_absences as abs')
      .join('staff_attendance as att', 'att.id', 'abs.attendance_id')
      .join('employees as e', 'e.id', 'att.employee_id')
      .join('employments as em', function () {
        this.on('em.employee_id', '=', 'e.id').andOn('em.status', db.raw("'active'"));
      })
      .join('campuses as c', 'c.id', 'em.campus_id');

    if (year)       q = q.where('att.year', year);
    if (term)       q = q.where('att.term', term);
    if (campusId)   q = q.where('em.campus_id', campusId);
    if (weekNumber) q = q.where('abs.week_number', weekNumber);

    const rows = await q.select(
      'c.id as campus_id',
      'c.name as campus_name',
      'e.id as employee_id',
      db.raw("concat(e.first_name, ' ', e.last_name) as employee_name"),
      'e.staff_no',
      db.raw('SUM(abs.days) as total_absent_days'),
      db.raw("STRING_AGG(DISTINCT abs.reason, ', ') as reasons"),
    ).groupBy('c.id', 'c.name', 'e.id', 'e.first_name', 'e.last_name', 'e.staff_no')
     .orderBy(['c.name', 'e.first_name']);

    // Group by campus
    const campusMap: Record<string, { campus_id: string; campus_name: string; staff: any[] }> = {};
    for (const r of rows) {
      if (!campusMap[r.campus_id]) {
        campusMap[r.campus_id] = { campus_id: r.campus_id, campus_name: r.campus_name, staff: [] };
      }
      campusMap[r.campus_id].staff.push({
        employee_id:      r.employee_id,
        employee_name:    r.employee_name,
        staff_no:         r.staff_no,
        total_absent_days: Number(r.total_absent_days),
        reasons:          r.reasons ? r.reasons.split(', ').filter(Boolean) : [],
      });
    }

    const result = Object.values(campusMap).map((c) => ({
      ...c,
      total_absent_staff: c.staff.length,
      total_absent_days:  c.staff.reduce((s, st) => s + st.total_absent_days, 0),
    })).sort((a, b) => b.total_absent_staff - a.total_absent_staff);

    res.json(result);
  } catch (err) { next(err); }
});

// ─── GET /api/analytics/attendance-alerts ────────────────────────────────────
// Staff whose attendance % is below threshold (default 75%).
// Params: year, term, campusId, threshold (0–100, default 75)
router.get('/attendance-alerts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year, term, campusId } = parseFilters(req.query as any);
    const threshold = req.query.threshold ? Number(req.query.threshold) : 75;

    let q = db('staff_attendance as att')
      .join('employees as e', 'e.id', 'att.employee_id')
      .join('employments as em', function () {
        this.on('em.employee_id', '=', 'e.id').andOn('em.status', db.raw("'active'"));
      })
      .join('campuses as c', 'c.id', 'em.campus_id');

    if (year)     q = q.where('att.year', year);
    if (term)     q = q.where('att.term', term);
    if (campusId) q = q.where('em.campus_id', campusId);

    const rows = await q.select(
      'e.id as employee_id',
      db.raw("concat(e.first_name, ' ', e.last_name) as employee_name"),
      'e.staff_no',
      'c.id as campus_id',
      'c.name as campus_name',
      db.raw('SUM(att.days_present) as total_present'),
      db.raw('SUM(att.weeks * CASE WHEN LOWER(att.school_type) = \'boarding\' THEN 7 ELSE 6 END) as total_expected'),
    ).groupBy('e.id', 'e.first_name', 'e.last_name', 'e.staff_no', 'c.id', 'c.name');

    const alerts = rows
      .map((r: any) => {
        const expected = Number(r.total_expected);
        const present  = Number(r.total_present);
        const pct = expected > 0 ? (present / expected) * 100 : 100;
        return {
          employee_id:    r.employee_id,
          employee_name:  r.employee_name,
          staff_no:       r.staff_no,
          campus_id:      r.campus_id,
          campus_name:    r.campus_name,
          attendance_pct: Number(pct.toFixed(2)),
        };
      })
      .filter((r: any) => r.attendance_pct < threshold)
      .sort((a: any, b: any) => a.attendance_pct - b.attendance_pct);

    res.json({ count: alerts.length, threshold, staff: alerts });
  } catch (err) { next(err); }
});

export default router;
