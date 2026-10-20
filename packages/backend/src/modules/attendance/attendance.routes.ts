import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
router.use(authenticate);

function computeExpectedDays(weeks: number, schoolType: string): number {
  return weeks * (schoolType.toLowerCase() === 'boarding' ? 7 : 6);
}

function getAttendanceRating(pct: number): string {
  if (pct >= 95) return 'EXCELLENT';
  if (pct >= 85) return 'GOOD';
  if (pct >= 70) return 'FAIR';
  return 'POOR';
}

async function loadRecord(id: string) {
  const record = await db('staff_attendance')
    .join('employees', 'staff_attendance.employee_id', 'employees.id')
    .where('staff_attendance.id', id)
    .select(
      'staff_attendance.*',
      db.raw("concat(employees.first_name, ' ', employees.last_name) as employee_name"),
      'employees.staff_no',
    )
    .first();

  if (!record) return null;

  const absences = await db('staff_attendance_absences')
    .where('attendance_id', id)
    .select('*');

  const expectedDays = computeExpectedDays(record.weeks, record.school_type);
  const daysAbsent = absences.reduce((s: number, d: any) => s + d.days, 0);
  const pct = expectedDays > 0 ? Math.round((record.days_present / expectedDays) * 10000) / 100 : 0;

  return {
    ...record,
    absence_details: absences,
    expected_days: expectedDays,
    days_absent: daysAbsent,
    attendance_percentage: pct,
    rating: getAttendanceRating(pct),
  };
}

const AbsenceSchema = z.object({
  reason: z.string().min(1).max(200),
  days: z.number().int().min(0),
  notes: z.string().optional(),
});

const RecordCreateSchema = z.object({
  employeeId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  term: z.enum(['I', 'II', 'III']),
  weeks: z.number().int().min(1).max(52),
  schoolType: z.preprocess((v) => typeof v === 'string' ? v.toUpperCase() : v, z.enum(['DAY', 'BOARDING'])),
  daysPresent: z.number().int().min(0),
  notes: z.string().optional(),
  absences: z.array(AbsenceSchema).default([]),
});

const RecordUpdateSchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  term: z.enum(['I', 'II', 'III']).optional(),
  weeks: z.number().int().min(1).max(52).optional(),
  schoolType: z.preprocess((v) => typeof v === 'string' ? v.toUpperCase() : v, z.enum(['DAY', 'BOARDING'])).optional(),
  daysPresent: z.number().int().min(0).optional(),
  notes: z.string().optional(),
  absences: z.array(AbsenceSchema).optional(),
});

router.get('/', requirePermission('attendance', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let q = db('staff_attendance')
        .join('employees', 'staff_attendance.employee_id', 'employees.id')
        .select(
          'staff_attendance.*',
          db.raw("concat(employees.first_name, ' ', employees.last_name) as employee_name"),
          'employees.staff_no',
        )
        .orderBy('staff_attendance.year', 'desc')
        .orderByRaw("CASE staff_attendance.term WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 END");

      if (req.query.staffId) q = q.where('staff_attendance.employee_id', req.query.staffId as string);
      if (req.query.year)    q = q.where('staff_attendance.year', Number(req.query.year));
      if (req.query.term)    q = q.where('staff_attendance.term', req.query.term as string);

      const rows = await q;

      const result = await Promise.all(rows.map(async (r: any) => {
        const absences = await db('staff_attendance_absences').where('attendance_id', r.id).select('*');
        const expectedDays = computeExpectedDays(r.weeks, r.school_type);
        const daysAbsent = absences.reduce((s: number, d: any) => s + d.days, 0);
        const pct = expectedDays > 0 ? Math.round((r.days_present / expectedDays) * 10000) / 100 : 0;
        return {
          ...r,
          expected_days: expectedDays,
          days_absent: daysAbsent,
          attendance_percentage: pct,
          rating: getAttendanceRating(pct),
          absence_details: absences,
        };
      }));

      res.json(result);
    } catch (err) { next(err); }
  }
);

router.get('/:id', requirePermission('attendance', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const record = await loadRecord(req.params.id);
      if (!record) throw new AppError(404, 'Attendance record not found');
      res.json(record);
    } catch (err) { next(err); }
  }
);

router.post('/', requirePermission('attendance', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = RecordCreateSchema.parse(req.body);

      const expectedDays = computeExpectedDays(data.weeks, data.schoolType);
      if (data.daysPresent > expectedDays) {
        throw new AppError(400, `Days present (${data.daysPresent}) cannot exceed expected days (${expectedDays})`);
      }

      const dupe = await db('staff_attendance')
        .where({ employee_id: data.employeeId, year: data.year, term: data.term })
        .first();
      if (dupe) throw new AppError(409, `Attendance record for ${data.year} Term ${data.term} already exists for this employee`);

      const id = uuidv4();
      const userId = (req as any).user?.id;

      await db.transaction(async (trx) => {
        await trx('staff_attendance').insert({
          id,
          employee_id: data.employeeId,
          year: data.year,
          term: data.term,
          weeks: data.weeks,
          school_type: data.schoolType.toLowerCase(),
          days_present: data.daysPresent,
          notes: data.notes ?? null,
          recorded_by: userId ?? null,
        });

        for (const a of data.absences) {
          if (a.days > 0) {
            await trx('staff_attendance_absences').insert({
              id: uuidv4(),
              attendance_id: id,
              reason: a.reason,
              days: a.days,
              notes: a.notes ?? null,
            });
          }
        }
      });

      const record = await loadRecord(id);
      res.status(201).json(record);
    } catch (err) { next(err); }
  }
);

router.put('/:id', requirePermission('attendance', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await db('staff_attendance').where('id', req.params.id).first();
      if (!existing) throw new AppError(404, 'Attendance record not found');

      const data = RecordUpdateSchema.parse(req.body);

      await db.transaction(async (trx) => {
        const update: Record<string, unknown> = { updated_at: new Date() };
        if (data.year !== undefined)        update.year = data.year;
        if (data.term !== undefined)        update.term = data.term;
        if (data.weeks !== undefined)       update.weeks = data.weeks;
        if (data.schoolType !== undefined)  update.school_type = data.schoolType.toLowerCase();
        if (data.daysPresent !== undefined) {
          const weeks = data.weeks ?? existing.weeks;
          const schoolType = (data.schoolType ?? existing.school_type) as string;
          const expected = computeExpectedDays(weeks, schoolType);
          if (data.daysPresent > expected) {
            throw new AppError(400, `Days present (${data.daysPresent}) cannot exceed expected days (${expected})`);
          }
          update.days_present = data.daysPresent;
        }
        if (data.notes !== undefined) update.notes = data.notes;

        await trx('staff_attendance').where('id', req.params.id).update(update);

        if (data.absences !== undefined) {
          await trx('staff_attendance_absences').where('attendance_id', req.params.id).del();
          for (const a of data.absences) {
            if (a.days > 0) {
              await trx('staff_attendance_absences').insert({
                id: uuidv4(),
                attendance_id: req.params.id,
                reason: a.reason,
                days: a.days,
                notes: a.notes ?? null,
              });
            }
          }
        }
      });

      const record = await loadRecord(req.params.id);
      res.json(record);
    } catch (err) { next(err); }
  }
);

router.delete('/:id', requirePermission('attendance', 'delete'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await db('staff_attendance').where('id', req.params.id).del();
      if (!deleted) throw new AppError(404, 'Attendance record not found');
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

export default router;
