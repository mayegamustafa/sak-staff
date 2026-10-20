import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { generateStaffNo } from '@sak/shared';

const router = Router();
router.use(authenticate);

const EmployeeSchema = z.object({
  // Core
  firstName:              z.string().min(1).max(100),
  middleName:             z.string().max(100).optional(),
  lastName:               z.string().min(1).max(100),
  gender:                 z.enum(['male', 'female', 'other']),
  dateOfBirth:            z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  nationality:            z.string().default('Ugandan'),
  nationalId:             z.string().max(50).optional(),
  passportNo:             z.string().max(50).optional(),
  maritalStatus:          z.enum(['single', 'married', 'divorced', 'widowed']).optional(),
  bloodGroup:             z.string().max(10).optional(),
  religion:               z.string().max(100).optional(),
  tribe:                  z.string().max(100).optional(),
  phone:                  z.string().min(7).max(30),
  phone2:                 z.string().max(30).optional(),
  whatsappPhone:          z.string().max(30).optional(),
  email:                  z.string().email().max(255).optional().or(z.literal('')),
  residentialAddress:     z.string().optional(),
  // Appointment
  dateAppointed:          z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  typeOfWork:             z.string().max(200).optional(),
  // Family
  spouseName:             z.string().max(200).optional(),
  spousePhone:            z.string().max(30).optional(),
  noOfChildren:           z.number().int().min(0).optional(),
  // Residence
  currentZone:            z.string().max(200).optional(),
  landlordName:           z.string().max(200).optional(),
  parentsNames:           z.string().optional(),
  village:                z.string().max(200).optional(),
  villageZone:            z.string().max(200).optional(),
  villageDirection:       z.string().optional(),
  // Free-text sections
  otherJobInterests:       z.string().optional(),
  earlierResponsibilities: z.string().optional(),
  specialCourses:          z.string().optional(),
  otherSkills:             z.string().optional(),
  subjectsOfPreference:    z.string().optional(),
  tin:                     z.string().max(50).optional(),
  nssfNumber:              z.string().max(50).optional(),
  medicalBackground:       z.string().optional(),
  otherInformation:        z.string().optional(),
  // Declaration
  declarationName:        z.string().max(200).optional(),
  declarationTitle:       z.string().max(200).optional(),
  declarationSignature:   z.string().optional(),
  declarationDate:        z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  // Witness
  witnessName:            z.string().max(200).optional(),
  witnessTitle:           z.string().max(200).optional(),
  witnessSignature:       z.string().optional(),
  witnessTel:             z.string().max(30).optional(),
});

// GET /api/employees  – list with search + pagination
router.get('/', requirePermission('staff_profiles', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page      = parseInt(req.query.page    as string || '1',  10);
      const limit     = parseInt(req.query.limit   as string || '20', 10);
      const search    = (req.query.search    as string || '').trim();
      const gender    = (req.query.gender    as string || '').trim();
      const campusId  = (req.query.campusId  as string || '').trim();
      const status    = (req.query.status    as string || 'active').trim();
      const subject   = (req.query.subject   as string || '').trim();
      const classId   = (req.query.classId   as string || '').trim();

      // Latest active employment per employee (DISTINCT ON for Postgres)
      const latestEmp = db('employments')
        .distinctOn('employee_id')
        .where('status', 'active')
        .orderBy('employee_id')
        .orderBy('start_date', 'desc')
        .select('employee_id', 'job_title', 'campus_id')
        .as('latest_emp');

      let query = db('employees as e')
        .leftJoin(latestEmp, 'latest_emp.employee_id', 'e.id')
        .leftJoin('campuses as c', 'c.id', 'latest_emp.campus_id');

      if (classId) {
        query = query.whereExists(
          db('employee_classes as ec').where('ec.employee_id', db.raw('e.id')).where('ec.class_id', classId).select(1)
        );
      }

      if (status === 'inactive') query = query.where('e.is_active', false);
      else if (status !== 'all') query = query.where('e.is_active', true);

      if (search) {
        query = query.where((qb) => {
          qb.whereILike('e.first_name',  `%${search}%`)
            .orWhereILike('e.last_name',  `%${search}%`)
            .orWhereILike('e.staff_no',   `%${search}%`)
            .orWhereILike('e.phone',      `%${search}%`)
            .orWhereILike('e.middle_name',`%${search}%`);
        });
      }
      if (gender)   query = query.where('e.gender', gender);
      if (campusId) query = query.where('latest_emp.campus_id', campusId);
      if (subject)  query = query.whereILike('e.subjects_of_preference', `%${subject}%`);

      const [{ count }] = await query.clone().count('e.id as count');
      const employees = await query
        .orderBy('e.created_at', 'desc')
        .limit(limit)
        .offset((page - 1) * limit)
        .select(
          'e.id', 'e.staff_no', 'e.first_name', 'e.middle_name', 'e.last_name',
          'e.gender', 'e.phone', 'e.is_active', 'e.created_at',
          'e.subjects_of_preference',
          'latest_emp.job_title', 'c.name as campus_name',
        );

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

      const [emergency, education, certifications, workHistory, referees] = await Promise.all([
        db('emergency_contacts').where('employee_id', req.params.id),
        db('education_records').where('employee_id', req.params.id).orderBy('year_from', 'desc'),
        db('certifications').where('employee_id', req.params.id).orderBy('issue_date', 'desc'),
        db('work_history').where('employee_id', req.params.id).orderBy('created_at', 'asc'),
        db('employee_referees').where('employee_id', req.params.id).orderBy('ref_order', 'asc'),
      ]);

      res.json({ ...employee, emergencyContacts: emergency, education, certifications, workHistory, referees });
    } catch (err) { next(err); }
  }
);

// POST /api/employees
router.post('/', requirePermission('staff_profiles', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = EmployeeSchema.parse(req.body);
      const campusId: string | undefined = (req.body as any).campusId;

      // Generate staff number — include campus code + year of appointment if available
      const year = data.dateAppointed ? new Date(data.dateAppointed).getFullYear() : new Date().getFullYear();
      const [{ count }] = await db('employees').count('id as count');
      let campusCode: string | null = null;
      if (campusId) {
        const campus = await db('campuses').where('id', campusId).select('code').first();
        campusCode = campus?.code ?? null;
      }
      const staffNo = generateStaffNo(year, Number(count) + 1, campusCode);
      const [employee] = await db('employees').insert({
        id: uuidv4(),
        staff_no: staffNo,
        first_name:              data.firstName,
        middle_name:             data.middleName,
        last_name:               data.lastName,
        gender:                  data.gender,
        date_of_birth:           data.dateOfBirth,
        nationality:             data.nationality,
        national_id:             data.nationalId,
        passport_no:             data.passportNo,
        marital_status:          data.maritalStatus,
        blood_group:             data.bloodGroup,
        religion:                data.religion,
        tribe:                   data.tribe,
        phone:                   data.phone,
        phone2:                  data.phone2,
        whatsapp_phone:          data.whatsappPhone,
        email:                   data.email || null,
        residential_address:     data.residentialAddress,
        date_appointed:          data.dateAppointed,
        type_of_work:            data.typeOfWork,
        spouse_name:             data.spouseName,
        spouse_phone:            data.spousePhone,
        no_of_children:          data.noOfChildren,
        current_zone:            data.currentZone,
        landlord_name:           data.landlordName,
        parents_names:           data.parentsNames,
        village:                 data.village,
        village_zone:            data.villageZone,
        village_direction:       data.villageDirection,
        other_job_interests:      data.otherJobInterests,
        earlier_responsibilities:  data.earlierResponsibilities,
        special_courses:           data.specialCourses,
        other_skills:              data.otherSkills,
        subjects_of_preference:    data.subjectsOfPreference,
        tin:                       data.tin,
        nssf_number:               data.nssfNumber,
        medical_background:        data.medicalBackground,
        other_information:         data.otherInformation,
        declaration_name:          data.declarationName,
        declaration_title:         data.declarationTitle,
        declaration_signature:     data.declarationSignature,
        declaration_date:          data.declarationDate,
        witness_name:              data.witnessName,
        witness_title:             data.witnessTitle,
        witness_signature:         data.witnessSignature,
        witness_tel:               data.witnessTel,
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
          first_name:              data.firstName,
          middle_name:             data.middleName,
          last_name:               data.lastName,
          gender:                  data.gender,
          date_of_birth:           data.dateOfBirth,
          nationality:             data.nationality,
          national_id:             data.nationalId,
          passport_no:             data.passportNo,
          marital_status:          data.maritalStatus,
          blood_group:             data.bloodGroup,
          religion:                data.religion,
          tribe:                   data.tribe,
          phone:                   data.phone,
          phone2:                  data.phone2,
          whatsapp_phone:          data.whatsappPhone,
          email:                   data.email || null,
          residential_address:     data.residentialAddress,
          date_appointed:          data.dateAppointed,
          type_of_work:            data.typeOfWork,
          spouse_name:             data.spouseName,
          spouse_phone:            data.spousePhone,
          no_of_children:          data.noOfChildren,
          current_zone:            data.currentZone,
          landlord_name:           data.landlordName,
          parents_names:           data.parentsNames,
          village:                 data.village,
          village_zone:            data.villageZone,
          village_direction:       data.villageDirection,
          other_job_interests:      data.otherJobInterests,
          earlier_responsibilities:  data.earlierResponsibilities,
          special_courses:           data.specialCourses,
          other_skills:              data.otherSkills,
          subjects_of_preference:    data.subjectsOfPreference,
          tin:                       data.tin,
          nssf_number:               data.nssfNumber,
          medical_background:        data.medicalBackground,
          other_information:         data.otherInformation,
          declaration_name:          data.declarationName,
          declaration_title:         data.declarationTitle,
          declaration_signature:     data.declarationSignature,
          declaration_date:          data.declarationDate,
          witness_name:              data.witnessName,
          witness_title:             data.witnessTitle,
          witness_signature:         data.witnessSignature,
          witness_tel:               data.witnessTel,
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

// PUT /api/employees/:id/education/:eduId
router.put('/:id/education/:eduId', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { institution, qualification, fieldOfStudy, yearFrom, yearTo, grade, honours } = req.body;
      if (!institution || !qualification || !fieldOfStudy || !yearFrom || !yearTo) {
        throw new AppError(400, 'institution, qualification, fieldOfStudy, yearFrom and yearTo are required');
      }
      const [row] = await db('education_records')
        .where({ id: req.params.eduId, employee_id: req.params.id })
        .update({
          institution,
          qualification,
          field_of_study: fieldOfStudy,
          year_from: Number(yearFrom),
          year_to: Number(yearTo),
          grade: grade || null,
          honours: honours || null,
        })
        .returning('*');
      if (!row) throw new AppError(404, 'Education record not found');
      res.json(row);
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

// ── Work History CRUD ─────────────────────────────────────────────────────────

// POST /api/employees/:id/work-history
router.post('/:id/work-history', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { periodFrom, periodTo, organisation, title, supervisorName } = req.body;
      if (!periodFrom || !periodTo || !organisation || !title)
        throw new AppError(400, 'periodFrom, periodTo, organisation and title are required');
      const [row] = await db('work_history').insert({
        id: uuidv4(),
        employee_id:     req.params.id,
        period_from:     periodFrom,
        period_to:       periodTo,
        organisation,
        title,
        supervisor_name: supervisorName || null,
      }).returning('*');
      res.status(201).json(row);
    } catch (err) { next(err); }
  }
);

// PUT /api/employees/:id/work-history/:whId
router.put('/:id/work-history/:whId', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { periodFrom, periodTo, organisation, title, supervisorName } = req.body;
      if (!periodFrom || !periodTo || !organisation || !title)
        throw new AppError(400, 'periodFrom, periodTo, organisation and title are required');
      const [row] = await db('work_history')
        .where({ id: req.params.whId, employee_id: req.params.id })
        .update({ period_from: periodFrom, period_to: periodTo, organisation, title, supervisor_name: supervisorName || null })
        .returning('*');
      if (!row) throw new AppError(404, 'Work history record not found');
      res.json(row);
    } catch (err) { next(err); }
  }
);

// DELETE /api/employees/:id/work-history/:whId
router.delete('/:id/work-history/:whId', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await db('work_history').where({ id: req.params.whId, employee_id: req.params.id }).delete();
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

// ── Referees CRUD ─────────────────────────────────────────────────────────────

// POST /api/employees/:id/referees
router.post('/:id/referees', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refOrder, name, title, phone, email, address } = req.body;
      if (!name) throw new AppError(400, 'Referee name is required');
      const [row] = await db('employee_referees').insert({
        id:         uuidv4(),
        employee_id: req.params.id,
        ref_order:  Number(refOrder) || 1,
        name,
        title:      title  || null,
        phone:      phone  || null,
        email:      email  || null,
        address:    address || null,
      }).returning('*');
      res.status(201).json(row);
    } catch (err) { next(err); }
  }
);

// PUT /api/employees/:id/referees/:refId
router.put('/:id/referees/:refId', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, title, phone, email, address } = req.body;
      const [row] = await db('employee_referees')
        .where({ id: req.params.refId, employee_id: req.params.id })
        .update({ name, title: title || null, phone: phone || null, email: email || null, address: address || null, updated_at: new Date() })
        .returning('*');
      res.json(row);
    } catch (err) { next(err); }
  }
);

// DELETE /api/employees/:id/referees/:refId
router.delete('/:id/referees/:refId', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await db('employee_referees').where({ id: req.params.refId, employee_id: req.params.id }).delete();
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

// POST /api/employees/:id/emergency-contacts
router.post('/:id/emergency-contacts', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { fullName, relationship, phone, address } = req.body;
      if (!fullName) throw new AppError(400, 'Full name is required');
      const [row] = await db('emergency_contacts').insert({
        id:           uuidv4(),
        employee_id:  req.params.id,
        full_name:    fullName,
        relationship: relationship || '',
        phone:        phone        || '',
        address:      address      || null,
      }).returning('*');
      res.status(201).json(row);
    } catch (err) { next(err); }
  }
);

// PUT /api/employees/:id/emergency-contacts/:contactId
router.put('/:id/emergency-contacts/:contactId', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { fullName, relationship, phone, address } = req.body;
      const [row] = await db('emergency_contacts')
        .where({ id: req.params.contactId, employee_id: req.params.id })
        .update({
          ...(fullName    !== undefined && { full_name:    fullName }),
          ...(relationship !== undefined && { relationship: relationship || '' }),
          ...(phone       !== undefined && { phone:        phone || '' }),
          ...(address     !== undefined && { address:      address || null }),
          updated_at: new Date(),
        }).returning('*');
      res.json(row);
    } catch (err) { next(err); }
  }
);

// ── Staff Exit / Reactivation ────────────────────────────────────────────────

const EXIT_REASONS = ['resigned', 'terminated', 'retired', 'transferred', 'deceased'] as const;

// POST /api/employees/:id/deactivate
router.post('/:id/deactivate', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { exitReason, exitDate, exitNotes } = req.body;
      if (!exitReason || !EXIT_REASONS.includes(exitReason)) {
        throw new AppError(400, `exitReason must be one of: ${EXIT_REASONS.join(', ')}`);
      }
      if (!exitDate) throw new AppError(400, 'exitDate is required');

      const emp = await db('employees').where('id', req.params.id).first();
      if (!emp) throw new AppError(404, 'Employee not found');

      // 1. Mark employee inactive + record exit info
      await db('employees').where('id', req.params.id).update({
        is_active:   false,
        exit_reason: exitReason,
        exit_date:   exitDate,
        exit_notes:  exitNotes || null,
        updated_at:  new Date(),
      });

      // 2. Close any active employment records
      await db('employments')
        .where({ employee_id: req.params.id, status: 'active' })
        .update({ status: 'ended', end_date: exitDate, updated_at: new Date() });

      res.json({ message: 'Staff member deactivated successfully' });
    } catch (err) { next(err); }
  }
);

// POST /api/employees/:id/reactivate
router.post('/:id/reactivate', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const emp = await db('employees').where('id', req.params.id).first();
      if (!emp) throw new AppError(404, 'Employee not found');

      await db('employees').where('id', req.params.id).update({
        is_active:   true,
        exit_reason: null,
        exit_date:   null,
        exit_notes:  null,
        updated_at:  new Date(),
      });

      res.json({ message: 'Staff member reactivated' });
    } catch (err) { next(err); }
  }
);

// ── Onboarding Tokens ────────────────────────────────────────────────────────

// POST /api/employees/:id/onboarding-token
router.post('/:id/onboarding-token', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const emp = await db('employees').where('id', req.params.id).first();
      if (!emp) throw new AppError(404, 'Employee not found');

      // Revoke any existing unused tokens for this employee
      await db('onboarding_tokens')
        .where({ employee_id: req.params.id, is_revoked: false })
        .whereNull('used_at')
        .update({ is_revoked: true, updated_at: new Date() });

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const [row] = await db('onboarding_tokens').insert({
        id:          uuidv4(),
        employee_id: req.params.id,
        token,
        created_by:  req.user!.userId,
        expires_at:  expiresAt,
        is_revoked:  false,
      }).returning('*');

      res.status(201).json({
        ...row,
        employeeName: `${emp.first_name} ${emp.last_name}`,
        staffNo: emp.staff_no,
      });
    } catch (err) { next(err); }
  }
);

// GET /api/employees/:id/onboarding-tokens
router.get('/:id/onboarding-tokens', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await db('onboarding_tokens')
        .where('employee_id', req.params.id)
        .orderBy('created_at', 'desc')
        .limit(10);
      res.json(rows);
    } catch (err) { next(err); }
  }
);

// DELETE /api/employees/onboarding-tokens/:tokenId
router.delete('/onboarding-tokens/:tokenId', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await db('onboarding_tokens')
        .where('id', req.params.tokenId)
        .update({ is_revoked: true, updated_at: new Date() });
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

// GET /api/employees/:id/bank-details
router.get('/:id/bank-details', requirePermission('staff_profiles', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await db('bank_details').where('employee_id', req.params.id).orderBy('is_primary', 'desc');
      res.json(rows);
    } catch (err) { next(err); }
  }
);

// GET /api/employees/:id/classes  – classes assigned to this teacher
router.get('/:id/classes', requirePermission('staff_profiles', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await db('employee_classes as ec')
        .join('school_classes as sc', 'sc.id', 'ec.class_id')
        .where('ec.employee_id', req.params.id)
        .select('sc.id', 'sc.name', 'sc.level', 'sc.display_order');
      res.json(rows);
    } catch (err) { next(err); }
  }
);

// PUT /api/employees/:id/classes  – replace class list (body: { classIds: string[] })
router.put('/:id/classes', requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { classIds } = z.object({ classIds: z.array(z.string().uuid()) }).parse(req.body);
      await db.transaction(async (trx) => {
        await trx('employee_classes').where('employee_id', req.params.id).delete();
        if (classIds.length) {
          await trx('employee_classes').insert(
            classIds.map((cid) => ({ id: uuidv4(), employee_id: req.params.id, class_id: cid }))
          );
        }
      });
      const rows = await db('employee_classes as ec')
        .join('school_classes as sc', 'sc.id', 'ec.class_id')
        .where('ec.employee_id', req.params.id)
        .select('sc.id', 'sc.name', 'sc.level', 'sc.display_order');
      res.json(rows);
    } catch (err) { next(err); }
  }
);

export default router;
