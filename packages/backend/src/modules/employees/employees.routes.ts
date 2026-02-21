import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { generateStaffNo } from '@sak/shared';

const router = Router();
router.use(authenticate);

const EmployeeSchema = z.object({
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  lastName: z.string().min(1).max(100),
  gender: z.enum(['male', 'female', 'other']),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  nationality: z.string().default('Ugandan'),
  nationalId: z.string().max(50).optional(),
  passportNo: z.string().max(50).optional(),
  maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed']).optional(),
  bloodGroup: z.string().max(10).optional(),
  religion: z.string().max(100).optional(),
  phone: z.string().min(7).max(30),
  phone2: z.string().max(30).optional(),
  email: z.string().email().optional(),
  residentialAddress: z.string().optional(),
});

// GET /api/employees  – list with search + pagination
router.get('/', requirePermission('staff_profiles', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = parseInt(req.query.limit as string || '20', 10);
      const search = (req.query.search as string || '').trim();

      let query = db('employees').where('is_active', true);

      if (search) {
        query = query.where((qb) => {
          qb.whereILike('first_name', `%${search}%`)
            .orWhereILike('last_name', `%${search}%`)
            .orWhereILike('staff_no', `%${search}%`)
            .orWhereILike('phone', `%${search}%`);
        });
      }

      const [{ count }] = await query.clone().count('id as count');
      const employees = await query
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset((page - 1) * limit)
        .select('id', 'staff_no', 'first_name', 'middle_name', 'last_name',
                'gender', 'phone', 'email', 'is_active', 'created_at');

      res.json({ data: employees, total: Number(count), page, limit });
    } catch (err) { next(err); }
  }
);

// GET /api/employees/:id  – full profile
router.get('/:id', requirePermission('staff_profiles', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const employee = await db('employees').where('id', req.params.id).first();
      if (!employee) throw new AppError(404, 'Employee not found');

      const [emergency, education, certifications] = await Promise.all([
        db('emergency_contacts').where('employee_id', req.params.id),
        db('education_records').where('employee_id', req.params.id).orderBy('year_from', 'desc'),
        db('certifications').where('employee_id', req.params.id).orderBy('issue_date', 'desc'),
      ]);

      res.json({ ...employee, emergencyContacts: emergency, education, certifications });
    } catch (err) { next(err); }
  }
);

// POST /api/employees
router.post('/', requirePermission('staff_profiles', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = EmployeeSchema.parse(req.body);

      // Generate staff number
      const year = new Date().getFullYear();
      const [{ count }] = await db('employees').count('id as count');
      const staffNo = generateStaffNo(year, Number(count) + 1);

      const [employee] = await db('employees').insert({
        id: uuidv4(),
        staff_no: staffNo,
        first_name: data.firstName,
        middle_name: data.middleName,
        last_name: data.lastName,
        gender: data.gender,
        date_of_birth: data.dateOfBirth,
        nationality: data.nationality,
        national_id: data.nationalId,
        passport_no: data.passportNo,
        marital_status: data.maritalStatus,
        blood_group: data.bloodGroup,
        religion: data.religion,
        phone: data.phone,
        phone2: data.phone2,
        email: data.email,
        residential_address: data.residentialAddress,
        is_active: true,
      }).returning('*');

      res.status(201).json(employee);
    } catch (err) { next(err); }
  }
);

// PUT /api/employees/:id
router.put('/:id', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = EmployeeSchema.partial().parse(req.body);
      const [updated] = await db('employees')
        .where('id', req.params.id)
        .update({
          first_name: data.firstName,
          middle_name: data.middleName,
          last_name: data.lastName,
          gender: data.gender,
          date_of_birth: data.dateOfBirth,
          nationality: data.nationality,
          national_id: data.nationalId,
          passport_no: data.passportNo,
          marital_status: data.maritalStatus,
          blood_group: data.bloodGroup,
          religion: data.religion,
          phone: data.phone,
          phone2: data.phone2,
          email: data.email,
          residential_address: data.residentialAddress,
          updated_at: new Date(),
        })
        .returning('*');
      if (!updated) throw new AppError(404, 'Employee not found');
      res.json(updated);
    } catch (err) { next(err); }
  }
);

// DELETE /api/employees/:id  – soft delete
router.delete('/:id', requirePermission('staff_profiles', 'delete'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await db('employees').where('id', req.params.id).update({ is_active: false, updated_at: new Date() });
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

// ── Education CRUD ────────────────────────────────────────────────────────────

// POST /api/employees/:id/education
router.post('/:id/education', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { institution, qualification, fieldOfStudy, yearFrom, yearTo, grade } = req.body;
      if (!institution || !qualification || !fieldOfStudy || !yearFrom || !yearTo) {
        throw new AppError(400, 'institution, qualification, fieldOfStudy, yearFrom and yearTo are required');
      }
      const [row] = await db('education_records').insert({
        id: uuidv4(),
        employee_id: req.params.id,
        institution,
        qualification,
        field_of_study: fieldOfStudy,
        year_from: Number(yearFrom),
        year_to: Number(yearTo),
        grade: grade || null,
      }).returning('*');
      res.status(201).json(row);
    } catch (err) { next(err); }
  }
);

// DELETE /api/employees/:id/education/:eduId
router.delete('/:id/education/:eduId', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await db('education_records')
        .where({ id: req.params.eduId, employee_id: req.params.id })
        .delete();
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

export default router;
