import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { config } from '../../config';
import { authenticate, requirePermission } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { uploadFileFilter, safeExtensionFor } from '../../utils/uploads';
import { generateStaffNo } from '@sak/shared';
import rateLimit from 'express-rate-limit';

const router = Router();

// ── Public endpoint abuse limits ────────────────────────────────────────────
// Station links are multi-use and unauthenticated, so cap how fast one client
// can submit forms (each may carry ~24 files) or probe for valid tokens.
export const onboardingViewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Please wait a few minutes and try again.',
});
const onboardingSubmitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: config.rateLimit.onboardingMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many submissions from this network. Please try again later.',
});

// ── Admin endpoints (authenticated) ─────────────────────────────────────────

// POST /api/onboarding/admin/generate-link
// Body: { campus_id: string, label?: string }  → station_link (multi-use, 7 days)
//    OR { whatsapp_number: string, recipient_name?: string }  → new_hire (single-use, legacy)
router.post('/admin/generate-link', authenticate, requirePermission('staff_profiles', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { campus_id, label, whatsapp_number, recipient_name } = req.body as {
        campus_id?: string; label?: string;
        whatsapp_number?: string; recipient_name?: string;
      };

      const token = crypto.randomBytes(32).toString('hex');
      const shortAlpha = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      const shortBytes = crypto.randomBytes(8);
      const short_code = Array.from(shortBytes).map((b: number) => shortAlpha[b % shortAlpha.length]).join('').slice(0, 8);

      // ── Station link (campus-based, multi-use, 7 days) ────────────────────
      if (campus_id?.trim()) {
        const campus = await db('campuses').where('id', campus_id.trim()).first();
        if (!campus) return res.status(404).json({ error: 'Campus not found' });

        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const [row] = await db('onboarding_tokens').insert({
          id:               uuidv4(),
          employee_id:      null,
          token_type:       'station_link',
          token,
          short_code,
          campus_id:        campus_id.trim(),
          recipient_name:   label?.trim() || campus.name || null,
          whatsapp_number:  null,
          created_by:       req.user!.userId,
          expires_at:       expiresAt,
          is_revoked:       false,
          submission_count: 0,
        }).returning('*');

        return res.status(201).json({ ...row, short_code, campus_name: campus.name });
      }

      // ── Legacy new-hire link (individual, single-use, 30 days) ───────────
      if (!whatsapp_number?.trim()) {
        return res.status(400).json({ error: 'Either campus_id or whatsapp_number is required' });
      }

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const [row] = await db('onboarding_tokens').insert({
        id:               uuidv4(),
        employee_id:      null,
        token_type:       'new_hire',
        token,
        whatsapp_number:  whatsapp_number.trim(),
        recipient_name:   recipient_name?.trim() || null,
        created_by:       req.user!.userId,
        expires_at:       expiresAt,
        is_revoked:       false,
      }).returning('*');

      return res.status(201).json(row);
    } catch (err) { next(err); }
  }
);

// GET /api/onboarding/admin/tokens
router.get('/admin/tokens', authenticate, requirePermission('staff_profiles', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await db('onboarding_tokens as ot')
        .leftJoin('campuses as c', 'c.id', 'ot.campus_id')
        .where('ot.token_type', 'station_link')
        .orderBy('ot.created_at', 'desc')
        .limit(100)
        .select(
          'ot.id', 'ot.token', 'ot.short_code', 'ot.campus_id', 'c.name as campus_name',
          'ot.recipient_name', 'ot.submission_count',
          'ot.is_revoked', 'ot.expires_at', 'ot.created_at', 'ot.created_by'
        );
      res.json(rows);
    } catch (err) { next(err); }
  }
);

// DELETE /api/onboarding/admin/tokens/:id  (?permanent=true for hard delete)
router.delete('/admin/tokens/:id', authenticate, requirePermission('staff_profiles', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.query.permanent === 'true') {
        const deleted = await db('onboarding_tokens').where('id', req.params.id).del();
        if (!deleted) throw new AppError(404, 'Token not found');
      } else {
        await db('onboarding_tokens')
          .where('id', req.params.id)
          .update({ is_revoked: true, updated_at: new Date() });
      }
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

// ── Pending approvals ─────────────────────────────────────────────────────────

// GET /api/onboarding/admin/pending/:id — full detail for one pending employee
router.get('/admin/pending/:id', authenticate, requirePermission('staff_profiles', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const emp = await db('employees as e')
        .leftJoin('campuses as c', 'c.id', 'e.campus_id')
        .where('e.id', req.params.id)
        .select('e.*', 'c.name as campus_name')
        .first();
      if (!emp) return res.status(404).json({ error: 'Not found' });

      const [emergencyContacts, educationRecords, workHistory, referees, documents] = await Promise.all([
        db('emergency_contacts').where('employee_id', emp.id).orderBy('created_at'),
        db('education_records').where('employee_id', emp.id).orderBy('year_from'),
        db('work_history').where('employee_id', emp.id).orderBy('period_from'),
        db('employee_referees').where('employee_id', emp.id).orderBy('ref_order'),
        db('documents').where('employee_id', emp.id).orderBy('created_at'),
      ]);

      res.json({ ...emp, emergencyContacts, educationRecords, workHistory, referees, documents });
    } catch (err) { next(err); }
  }
);

// GET /api/onboarding/admin/pending
// Returns all employees with approval_status = 'pending'
router.get('/admin/pending', authenticate, requirePermission('staff_profiles', 'create'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await db('employees as e')
        .leftJoin('campuses as c', 'c.id', 'e.campus_id')
        .where('e.approval_status', 'pending')
        .orderBy('e.created_at', 'asc')
        .select(
          'e.id', 'e.staff_no', 'e.first_name', 'e.middle_name', 'e.last_name',
          'e.phone', 'e.email', 'e.national_id', 'e.gender', 'e.date_of_birth',
          'e.nationality', 'e.residential_address', 'e.created_at',
          'e.campus_id', 'c.name as campus_name',
        );
      res.json(rows);
    } catch (err) { next(err); }
  }
);

// POST /api/onboarding/admin/:id/approve
// Activates the employee (is_active=true, approval_status='approved')
// Body: { job_title?, contract_type?, start_date?, department_id? }
// If job_title is provided, an employment record is created at the employee's campus.
router.post('/admin/:id/approve', authenticate, requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { job_title, contract_type, start_date, department_id } = req.body as {
        job_title?: string; contract_type?: string; start_date?: string; department_id?: string;
      };
      const updated = await db('employees')
        .where('id', req.params.id)
        .where('approval_status', 'pending')
        .update({
          is_active:       true,
          approval_status: 'approved',
          updated_at:      new Date(),
        });
      if (!updated) return res.status(404).json({ error: 'Not found or already processed' });
      const emp = await db('employees').where('id', req.params.id).first();
      // Create employment record if job title was given
      if (job_title?.trim() && emp?.campus_id) {
        await db('employments').insert({
          id:            uuidv4(),
          employee_id:   emp.id,
          campus_id:     emp.campus_id,
          department_id: department_id || null,
          job_title:     job_title.trim(),
          contract_type: contract_type || 'permanent',
          status:        'active',
          start_date:    start_date || new Date().toISOString().split('T')[0],
        });
      }
      res.json({ message: 'Employee approved and activated', employee: emp });
    } catch (err) { next(err); }
  }
);

// POST /api/onboarding/admin/:id/reject
// Body: { reason?: string }
// Sets approval_status='rejected', keeps is_active=false
router.post('/admin/:id/reject', authenticate, requirePermission('staff_profiles', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason } = req.body as { reason?: string };
      const updated = await db('employees')
        .where('id', req.params.id)
        .where('approval_status', 'pending')
        .update({
          is_active:        false,
          approval_status:  'rejected',
          other_information: reason
            ? db.raw("COALESCE(other_information || E'\\n', '') || ?", [`[REJECTED] ${reason}`])
            : db.raw('other_information'),
          updated_at:       new Date(),
        });
      if (!updated) return res.status(404).json({ error: 'Not found or already processed' });
      res.json({ message: 'Submission rejected' });
    } catch (err) { next(err); }
  }
);

// Multer for document uploads (public endpoint)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.resolve(config.upload.dir);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    // Extension comes from the declared mime type, never from the client filename.
    cb(null, `${uuidv4()}${safeExtensionFor(file.mimetype, file.originalname)}`);
  },
});
const upload = multer({ storage, fileFilter: uploadFileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// Helper: clean up all uploaded files in case of error
function cleanupUploadedFiles(req: Request): void {
  const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  for (const arr of Object.values(files)) {
    for (const f of arr) {
      try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch { /* ignore */ }
    }
  }
}

// Document field to category/title mapping
const DOC_MAP: Array<{ field: string; category: string; title: string }> = [
  { field: 'photo',         category: 'passport_photo', title: 'Passport Photo (Self-submitted)'     },
  { field: 'nid_scan',      category: 'national_id',    title: 'National ID / Passport Scan'          },
  { field: 'academic_docs', category: 'academic_cert',  title: 'Academic Certificate (Self-submitted)' },
  { field: 'cv',            category: 'cv',             title: 'CV / Resume (Self-submitted)'         },
  { field: 'other_docs',    category: 'other',          title: 'Supporting Document (Self-submitted)' },
];

// ── Token validation helper ──────────────────────────────────────────────────
async function resolveToken(token: string) {
  // First fetch the row without used_at restriction (needed for station_link multi-use)
  const row = await db('onboarding_tokens')
    .where({ token })
    .where('is_revoked', false)
    .first();
  if (!row) return null;
  // Check not expired
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

  if (row.token_type === 'station_link') {
    // Multi-use campus link — any staff at that campus can submit; never single-use
    return { tokenRow: row, emp: null, isNewHire: true };
  }

  // Legacy new_hire: single-use (block if already used)
  if (row.token_type === 'new_hire') {
    if (row.used_at) return null;
    return { tokenRow: row, emp: null, isNewHire: true };
  }

  // Existing employee update
  if (row.used_at) return null;
  const emp = await db('employees').where('id', row.employee_id).first();
  return emp ? { tokenRow: row, emp, isNewHire: false } : null;
}

// ── GET /onboarding/:token  –  render the self-service form ─────────────────
router.get('/:token', onboardingViewLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await resolveToken(req.params.token);
    if (!result) {
      return res.status(410).send(wrapPage('Link Expired', `
        <div class="card err">
          <svg width="48" height="48" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#ef4444" stroke-width="2"/><path d="M12 8v4m0 4h.01" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/></svg>
          <h2>Link Expired or Already Used</h2>
          <p>This link is no longer valid. Please contact HR to request a new one.</p>
        </div>`));
    }

    if (result.isNewHire) {
      // Resolve campus name for station links
      let campusName: string | null = null;
      if (result.tokenRow.campus_id) {
        const campus = await db('campuses').where('id', result.tokenRow.campus_id).first();
        campusName = campus?.name || null;
      }
      const title = campusName
        ? `Staff Registration — ${campusName}`
        : result.tokenRow.recipient_name
          ? `Staff Registration — ${result.tokenRow.recipient_name}`
          : 'Staff Registration Form';
      const greeting = campusName || result.tokenRow.recipient_name || null;
      return res.send(wrapPage(title, buildNewHireForm(req.params.token, greeting, campusName)));
    }

    const { emp } = result;
    const name = `${emp.first_name} ${emp.middle_name ? emp.middle_name + ' ' : ''}${emp.last_name}`;
    res.send(wrapPage(`Self-Service Form — ${name}`, buildForm(emp, req.params.token)));
  } catch (err) { next(err); }
});

// ── POST /onboarding/:token  – handle submission ─────────────────────────────
router.post('/:token', onboardingSubmitLimiter, upload.fields([
  { name: 'photo',         maxCount: 1  },
  { name: 'nid_scan',      maxCount: 2  },
  { name: 'academic_docs', maxCount: 10 },
  { name: 'cv',            maxCount: 1  },
  { name: 'other_docs',    maxCount: 10 },
]), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await resolveToken(req.params.token);
    if (!result) {
      cleanupUploadedFiles(req);
      return res.status(410).send(wrapPage('Link Expired', `
        <div class="card err">
          <h2>Link Expired or Already Used</h2>
          <p>This link is no longer valid. Please contact HR to request a new one.</p>
        </div>`));
    }

    const { tokenRow } = result;
    const b = req.body as Record<string, string>;

    // ── NEW HIRE flow: create a new employee record ───────────────────────────
    if (result.isNewHire) {
      if (!b.first_name?.trim() || !b.last_name?.trim()) {
        cleanupUploadedFiles(req);
        return res.status(400).send(wrapPage('Missing Info', `
          <div class="card err"><h2>Missing Required Fields</h2>
          <p>First name and last name are required.</p></div>`));
      }

      const newEmpId = uuidv4();
        // Look up campus code from token for staff number
        let campusCode: string | null = null;
        if (tokenRow.campus_id) {
          const campus = await db('campuses').where('id', tokenRow.campus_id).select('code').first();
          campusCode = campus?.code ?? null;
        }
        // Generate a proper SAK-[CAMPUS]-YYYY-XXXX staff number
        const year = b.start_date ? new Date(b.start_date).getFullYear() : new Date().getFullYear();
        const [{ count: empCount }] = await db('employees').count('id as count');
        const staffNo = generateStaffNo(year, Number(empCount) + 1, campusCode);
      await db('employees').insert({
        id:                     newEmpId,
        staff_no:               staffNo,
        first_name:             b.first_name.trim(),
        middle_name:            b.middle_name?.trim() || null,
        last_name:              b.last_name.trim(),
        gender:                 b.gender || 'male',
        date_of_birth:          b.date_of_birth || null,
        nationality:            b.nationality?.trim() || null,
        national_id:            b.national_id?.trim() || null,
        passport_no:            b.passport_no?.trim() || null,
        tribe:                  b.tribe?.trim() || null,
        phone:                  b.phone?.trim() || tokenRow.whatsapp_number,
        phone2:                 b.phone2?.trim() || null,
        whatsapp_phone:         b.whatsapp_phone?.trim() || tokenRow.whatsapp_number,
        email:                  b.email?.trim() || null,
        blood_group:            b.blood_group || null,
        religion:               b.religion || null,
        marital_status:         b.marital_status || null,
        spouse_name:            b.spouse_name?.trim() || null,
        spouse_phone:           b.spouse_phone?.trim() || null,
        no_of_children:         b.no_of_children ? Number(b.no_of_children) : null,
        parents_names:          b.parents_names?.trim() || null,
        residential_address:    b.residential_address?.trim() || null,
        village:                b.village?.trim() || null,
        subjects_of_preference: b.subjects_of_preference?.trim() || null,
        other_skills:           b.other_skills?.trim() || null,
        earlier_responsibilities: b.earlier_responsibilities?.trim() || null,
        special_courses:        b.special_courses?.trim() || null,
        medical_background:     b.medical_background?.trim() || null,
        other_information:      b.other_information?.trim() || null,
        campus_id:              tokenRow.campus_id || null,  // inherit campus from station link
        is_active:              false,          // inactive until HR approves
        approval_status:        'pending',      // awaiting HR/admin review
      });

      // Emergency contact
      if (b.ec_name?.trim()) {
        await db('emergency_contacts').insert({
          id:           uuidv4(),
          employee_id:  newEmpId,
          full_name:    b.ec_name.trim(),
          relationship: b.ec_relationship || '',
          phone:        b.ec_phone || '',
          address:      b.ec_address?.trim() || null,
        });
      }

      // Education qualifications
      if (b.qualifications) {
        try {
          const quals = JSON.parse(b.qualifications) as Array<{
            level: string; institution: string; qualification: string; year_completed: string;
          }>;
          for (const q of quals) {
            if (!q.institution?.trim()) continue;
            await db('education_records').insert({
              id:             uuidv4(),
              employee_id:    newEmpId,
              level:          q.level || 'undergraduate',
              institution:    q.institution.trim(),
              qualification:  q.qualification || '',
              year_completed: q.year_completed || null,
            });
          }
        } catch { /* ignore */ }
      }

      // Bank details
      if (b.bank_name?.trim() && b.account_number?.trim()) {
        await db('bank_details').insert({
          id:             uuidv4(),
          employee_id:    newEmpId,
          bank_name:      b.bank_name.trim(),
          account_name:   b.account_name?.trim() || `${b.first_name} ${b.last_name}`,
          account_number: b.account_number.trim(),
          branch:         b.bank_branch?.trim() || null,
          is_primary:     true,
        });
      }

      // Documents (photo, NID, academic certs, CV, other)
      const uploadedFiles = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
      for (const { field, category, title } of DOC_MAP) {
        for (const f of uploadedFiles[field] ?? []) {
          await db('documents').insert({
            id:              uuidv4(),
            employee_id:     newEmpId,
            category,
            title,
            file_path:       f.filename,
            mime_type:       f.mimetype,
            file_size_bytes: f.size,
            uploaded_by:     tokenRow.created_by,
          });
        }
      }

      // For station_link: stay active (multi-use), just increment submission_count
      // For legacy new_hire: mark token used + link to employee
      if (tokenRow.token_type === 'station_link') {
        await db('onboarding_tokens').where('id', tokenRow.id).update({
          submission_count: db.raw('submission_count + 1'),
          updated_at:       new Date(),
        });
      } else {
        await db('onboarding_tokens').where('id', tokenRow.id).update({
          used_at:     new Date(),
          employee_id: newEmpId,
          updated_at:  new Date(),
        });
      }

      const fullName = `${b.first_name.trim()} ${b.last_name.trim()}`;
      return res.send(wrapPage('Registration Successful', `
        <div class="card ok">
          <svg width="56" height="56" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#22c55e" stroke-width="2"/><path d="M8 12l3 3 5-5" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <h2>Thank You, ${esc(fullName)}!</h2>
          <p>Your registration has been submitted to HR for review.</p>
          <p class="sub">HR will be in touch with you shortly to complete your onboarding.</p>
        </div>`));
    }

    // ── EXISTING EMPLOYEE update flow ─────────────────────────────────────────
    const emp = result.emp!;

    // 1. Update employee personal info
    await db('employees').where('id', emp.id).update({
      phone:                b.phone        || emp.phone,
      phone2:               b.phone2       || emp.phone2 || null,
      whatsapp_phone:       b.whatsapp_phone || emp.whatsapp_phone || null,
      email:                b.email        || emp.email  || null,
      residential_address:  b.residential_address || emp.residential_address || null,
      national_id:          b.national_id  || emp.national_id  || null,
      blood_group:          b.blood_group  || emp.blood_group  || null,
      religion:             b.religion     || emp.religion     || null,
      marital_status:       b.marital_status || emp.marital_status || null,
      spouse_name:          b.spouse_name  || emp.spouse_name  || null,
      no_of_children:       b.no_of_children ? Number(b.no_of_children) : emp.no_of_children,
      village:              b.village      || emp.village      || null,
      medical_background:   b.medical_background || emp.medical_background || null,
      updated_at:           new Date(),
    });

    // 2. Emergency contact
    if (b.ec_name?.trim()) {
      const existing = await db('emergency_contacts').where('employee_id', emp.id).first();
      if (existing) {
        await db('emergency_contacts').where('id', existing.id).update({
          full_name:    b.ec_name.trim(),
          relationship: b.ec_relationship || '',
          phone:        b.ec_phone || '',
          address:      b.ec_address || null,
          updated_at:   new Date(),
        });
      } else {
        await db('emergency_contacts').insert({
          id:           uuidv4(),
          employee_id:  emp.id,
          full_name:    b.ec_name.trim(),
          relationship: b.ec_relationship || '',
          phone:        b.ec_phone || '',
          address:      b.ec_address || null,
        });
      }
    }

    // 3. Education / qualifications (JSON-encoded array from hidden field)
    if (b.qualifications) {
      try {
        const quals = JSON.parse(b.qualifications) as Array<{
          level: string; institution: string; qualification: string; year_completed: string;
        }>;
        for (const q of quals) {
          if (!q.institution?.trim()) continue;
          await db('education_records').insert({
            id:              uuidv4(),
            employee_id:     emp.id,
            level:           q.level || 'undergraduate',
            institution:     q.institution.trim(),
            qualification:   q.qualification || '',
            year_completed:  q.year_completed || null,
          });
        }
      } catch { /* ignore parse errors */ }
    }

    // 4. Bank details
    if (b.bank_name?.trim() && b.account_number?.trim()) {
      const existingBank = await db('bank_details').where({ employee_id: emp.id, is_primary: true }).first();
      if (existingBank) {
        await db('bank_details').where('id', existingBank.id).update({
          bank_name:      b.bank_name.trim(),
          account_name:   b.account_name?.trim() || `${emp.first_name} ${emp.last_name}`,
          account_number: b.account_number.trim(),
          branch:         b.bank_branch?.trim() || null,
          updated_at:     new Date(),
        });
      } else {
        await db('bank_details').insert({
          id:             uuidv4(),
          employee_id:    emp.id,
          bank_name:      b.bank_name.trim(),
          account_name:   b.account_name?.trim() || `${emp.first_name} ${emp.last_name}`,
          account_number: b.account_number.trim(),
          branch:         b.bank_branch?.trim() || null,
          is_primary:     true,
        });
      }
    }

    // 5. Documents (photo, NID, academic certs, CV, other)
    const uploadedFiles = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    for (const { field, category, title } of DOC_MAP) {
      for (const f of uploadedFiles[field] ?? []) {
        await db('documents').insert({
          id:              uuidv4(),
          employee_id:     emp.id,
          category,
          title,
          file_path:       f.filename,
          mime_type:       f.mimetype,
          file_size_bytes: f.size,
          uploaded_by:     tokenRow.created_by,
        });
      }
    }

    // 6. Mark token as used
    await db('onboarding_tokens').where('id', tokenRow.id).update({
      used_at:    new Date(),
      updated_at: new Date(),
    });

    const name = `${emp.first_name} ${emp.last_name}`;
    res.send(wrapPage('Submission Successful', `
      <div class="card ok">
        <svg width="56" height="56" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#22c55e" stroke-width="2"/><path d="M8 12l3 3 5-5" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <h2>Thank You, ${esc(name)}!</h2>
        <p>Your information has been submitted successfully to HR.</p>
        <p class="sub">This link is now deactivated. Please contact HR if you need to make any changes.</p>
      </div>`));
  } catch (err) {
    cleanupUploadedFiles(req);
    next(err);
  }
});

export default router;

// ── HTML helpers ─────────────────────────────────────────────────────────────

/**
 * Escape a value for HTML text or a quoted attribute. These pages are public and
 * re-display names and details that were themselves submitted through a public
 * form, so every dynamic value must pass through here.
 */
function esc(val: unknown): string {
  if (val == null) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(title)} — SAK Schools</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f1f5f9; color: #1e293b; min-height: 100vh; }
    .top-bar { background: #1e3a5f; color: #fff; padding: 14px 24px; display: flex; align-items: center; gap: 12px; }
    .top-bar img { width: 36px; height: 36px; border-radius: 50%; background: #fff; }
    .top-bar .brand { font-weight: 700; font-size: 1.05rem; }
    .top-bar .sub   { font-size: .8rem; opacity: .7; }
    .container { max-width: 760px; margin: 0 auto; padding: 24px 16px 60px; }
    h1.page-title { font-size: 1.4rem; font-weight: 700; color: #1e3a5f; margin-bottom: 4px; }
    p.page-sub { font-size: .85rem; color: #64748b; margin-bottom: 24px; }
    .section { background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.06); margin-bottom: 20px; overflow: hidden; }
    .section-head { background: #1e3a5f; color: #fff; padding: 12px 20px; font-weight: 600; font-size: .9rem; display: flex; align-items: center; gap: 8px; }
    .section-body { padding: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .section-body.single { grid-template-columns: 1fr; }
    .section-body.triple { grid-template-columns: 1fr 1fr 1fr; }
    .full { grid-column: 1/-1; }
    label { display: block; font-size: .78rem; font-weight: 600; color: #475569; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .4px; }
    input, select, textarea { width: 100%; padding: 9px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: .9rem; background: #f8fafc; color: #1e293b; transition: border .15s; outline: none; }
    input:focus, select:focus, textarea:focus { border-color: #1e3a5f; background: #fff; }
    textarea { min-height: 90px; resize: vertical; }
    .add-btn { cursor: pointer; background: #f0f7ff; color: #1e3a5f; border: 1.5px dashed #93c5fd; border-radius: 8px; padding: 8px 16px; font-size: .85rem; font-weight: 600; width: 100%; margin-top: 4px; transition: background .15s; }
    .add-btn:hover { background: #dbeafe; }
    .edu-row { border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; position: relative; }
    .rm-btn { position: absolute; top: 10px; right: 10px; background: none; border: none; color: #ef4444; cursor: pointer; font-size: 1.1rem; font-weight: 700; }
    .photo-preview { width: 120px; height: 150px; border-radius: 8px; object-fit: cover; border: 2px solid #e2e8f0; display: none; margin-top: 10px; }
    .submit-btn { width: 100%; padding: 14px; background: #1e3a5f; color: #fff; border: none; border-radius: 10px; font-size: 1rem; font-weight: 700; cursor: pointer; transition: background .15s; margin-top: 8px; touch-action: manipulation; }
    .submit-btn:hover { background: #2d5a9e; }
    .submit-btn:disabled { background: #94a3b8; cursor: not-allowed; }
    .card { text-align: center; padding: 48px 24px; max-width: 480px; margin: 60px auto; background: #fff; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
    .card h2 { font-size: 1.4rem; margin: 16px 0 8px; }
    .card p { color: #64748b; line-height: 1.6; }
    .card.ok h2 { color: #15803d; }
    .card.err h2 { color: #dc2626; }
    .card .sub { font-size: .82rem; color: #94a3b8; margin-top: 12px; }
    /* ── Upload UI ── */
    .upload-item { margin-bottom: 16px; }
    .upload-item:last-child { margin-bottom: 0; }
    .upload-zone { position: relative; border: 2px dashed #cbd5e1; border-radius: 10px; background: #f8fafc; padding: 18px 16px; text-align: center; cursor: pointer; transition: border-color .15s, background .15s; }
    .upload-zone:hover, .upload-zone:focus-within { border-color: #1e3a5f; background: #f0f7ff; }
    .upload-zone input[type="file"] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
    .upload-hint { font-size: .82rem; color: #64748b; pointer-events: none; }
    .opt-tag { display: inline-block; font-size: .68rem; font-weight: 600; background: #dbeafe; color: #1d4ed8; border-radius: 4px; padding: 1px 6px; margin-left: 6px; vertical-align: middle; text-transform: uppercase; letter-spacing: .3px; }
    .opt-tag.rec { background: #dcfce7; color: #15803d; }
    .file-list { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
    .file-tag { display: inline-flex; align-items: center; gap: 5px; background: #e0f2fe; color: #0369a1; border-radius: 6px; padding: 4px 10px; font-size: .78rem; font-weight: 500; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-tag.is-pdf { background: #fef2f2; color: #b91c1c; }
    /* ── Thumbnail grid ── */
    .th-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .th-item { position: relative; width: 74px; }
    .th-img { width: 74px; height: 74px; object-fit: cover; border-radius: 6px; border: 2px solid #e2e8f0; display: block; cursor: pointer; transition: border-color .15s; }
    .th-img:hover { border-color: #1e3a5f; }
    .th-pdf { width: 74px; height: 74px; background: #fef2f2; color: #b91c1c; border-radius: 6px; border: 2px solid #fecaca; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: .85rem; letter-spacing: 1px; }
    .th-rm { position: absolute; top: -7px; right: -7px; width: 20px; height: 20px; border-radius: 50%; background: #ef4444; color: #fff; border: none; font-size: .9rem; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; box-shadow: 0 1px 4px rgba(0,0,0,.2); }
    .th-nm { font-size: .6rem; color: #64748b; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 74px; text-align: center; }
    /* ── Mobile ── */
    @media (max-width: 640px) {
      .container { padding: 16px 12px 80px; }
      .section-body, .section-body.triple { grid-template-columns: 1fr; }
      .edu-row { grid-template-columns: 1fr; }
      input, select, textarea { font-size: 1rem; padding: 11px 12px; min-height: 44px; }
      .add-btn { padding: 12px 16px; min-height: 44px; }
      .submit-btn { position: sticky; bottom: 12px; font-size: 1.05rem; padding: 16px; box-shadow: 0 4px 16px rgba(30,58,95,.35); }
      h1.page-title { font-size: 1.2rem; }
    }
  </style>
</head>
<body>
  <div class="top-bar">
    <div>
      <div class="brand">SAK Schools</div>
      <div class="sub">Staffing · Self-Service Portal</div>
    </div>
  </div>
  <div class="container">
    ${body}
  </div>
</body>
</html>`;
}

function buildNewHireForm(token: string, recipientName?: string | null, campusName?: string | null): string {
  const greeting = esc(campusName ? `Staff Registration — ${campusName}` : (recipientName ? `Welcome, ${recipientName}` : 'Staff Registration'));
  const bloodGroups = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
  const religions = ['Catholic','Protestant/Anglican','Muslim','Seventh Day Adventist','Pentecostal','Orthodox','Other'];
  const maritalStatuses = ['single','married','divorced','widowed'];
  const eduLevels = [
    { value:'primary', label:'Primary' },
    { value:'ordinary', label:'O-Level (UCE)' },
    { value:'advanced', label:'A-Level (UACE)' },
    { value:'certificate', label:'Certificate' },
    { value:'diploma', label:'Diploma' },
    { value:'undergraduate', label:"Bachelor's Degree" },
    { value:'postgraduate', label:"Master's / Postgrad" },
    { value:'phd', label:'PhD' },
    { value:'other', label:'Other' },
  ];
  const nationalities = [
    'Ugandan',
    'Tanzanian','Kenyan','Rwandan','Burundian','South Sudanese','Congolese (DRC)','Ethiopian','Somali','Sudanese','Eritrean',
    'Nigerian','Ghanaian','Zambian','Zimbabwean','Malawian','Mozambican','Cameroonian','Ivorian','Senegalese','Egyptian','South African',
    'British','American','Indian','Chinese','French','German','Canadian','Australian','Other',
  ];
  const ugandaTribes = [
    'Baganda','Banyankole / Ankole','Basoga','Bakiga','Banyoro','Batoro','Banyarwanda','Bagisu / Bamasaba',
    'Acholi','Lugbara','Langi','Alur','Iteso / Teso','Banyole','Bakonzo','Baamba','Basamia','Bafumbira',
    'Jopadhola','Kakwa','Madi','Aringa','Kumam','Sebei','Pokot','Jonam','Nubi','Other',
  ];


  const natOptions = nationalities.map(n => `<option value="${n}">${n}</option>`).join('');
  const tribeOptions = ugandaTribes.map(t => `<option value="${t}">${t}</option>`).join('');
  const bloodOptions = bloodGroups.map(g => `<option value="${g}">${g}</option>`).join('');
  const religionOptions = religions.map(r => `<option value="${r}">${r}</option>`).join('');
  const maritalOptions = maritalStatuses.map(s => `<option value="${s}">${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('');

  return `
  <style>
    .wz-stepper { display:flex; align-items:flex-start; margin-bottom:24px; }
    .wz-step { display:flex; flex-direction:column; align-items:center; flex:1; position:relative; }
    .wz-step:not(:last-child)::after { content:''; position:absolute; top:14px; left:50%; width:100%; height:2px; background:#e2e8f0; z-index:0; transition:background .3s; }
    .wz-step.done:not(:last-child)::after { background:#22c55e; }
    .wz-dot { width:28px; height:28px; border-radius:50%; background:#e2e8f0; color:#94a3b8; font-weight:700; font-size:.78rem; display:flex; align-items:center; justify-content:center; z-index:1; position:relative; transition:background .25s, color .25s; flex-shrink:0; }
    .wz-step.active .wz-dot { background:#1e3a5f; color:#fff; box-shadow:0 0 0 3px rgba(30,58,95,.2); }
    .wz-step.done .wz-dot { background:#22c55e; color:#fff; }
    .wz-label { font-size:.62rem; font-weight:600; color:#94a3b8; margin-top:5px; text-align:center; text-transform:uppercase; letter-spacing:.4px; line-height:1.2; }
    .wz-step.active .wz-label { color:#1e3a5f; }
    .wz-step.done .wz-label { color:#15803d; }
    .wizard-step { display:none; }
    .wizard-step.active { display:block; }
    .wz-nav { display:flex; gap:10px; margin-top:8px; }
    .wz-back { flex:0 0 auto; padding:12px 20px; background:#f1f5f9; color:#1e3a5f; border:1.5px solid #e2e8f0; border-radius:10px; font-size:.95rem; font-weight:700; cursor:pointer; transition:background .15s; touch-action:manipulation; display:flex; align-items:center; gap:5px; }
    .wz-back:hover { background:#e2e8f0; }
    .wz-next { flex:1; padding:14px; background:#1e3a5f; color:#fff; border:none; border-radius:10px; font-size:1rem; font-weight:700; cursor:pointer; transition:background .15s; touch-action:manipulation; display:flex; align-items:center; justify-content:center; gap:5px; }
    .wz-next:hover { background:#2d5a9e; }
    .wz-submit { flex:1; padding:14px; background:#15803d; color:#fff; border:none; border-radius:10px; font-size:1rem; font-weight:700; cursor:pointer; transition:background .15s; touch-action:manipulation; display:flex; align-items:center; justify-content:center; gap:5px; }
    .wz-submit:hover { background:#166534; }
    .wz-submit:disabled { background:#94a3b8; cursor:not-allowed; }
    @media (max-width:480px) { .wz-label { display:none; } }
  </style>

  <div id="cropModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;flex-direction:column;align-items:center;justify-content:center;padding:16px;">
    <div style="background:#1e293b;border-radius:14px;max-width:480px;width:100%;padding:16px;box-shadow:0 8px 40px rgba(0,0,0,.6);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="color:#fff;font-weight:700;font-size:1rem;">&#9986; Edit Image</span>
        <button type="button" onclick="closeCrop()" style="color:#94a3b8;background:none;border:none;font-size:1.6rem;cursor:pointer;line-height:1;">&times;</button>
      </div>
      <canvas id="cropCv" style="width:100%;border-radius:8px;cursor:grab;touch-action:none;display:block;background:#000;"></canvas>
      <p style="color:#94a3b8;font-size:.72rem;text-align:center;margin:8px 0 4px;">Drag to reposition &middot; Rotate/flip with buttons below</p>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button type="button" onclick="rotateCrop(-90)" style="flex:1;padding:9px;background:#334155;color:#fff;border:none;border-radius:8px;cursor:pointer;">&#8634; Left</button>
        <button type="button" onclick="flipCrop()" style="flex:1;padding:9px;background:#334155;color:#fff;border:none;border-radius:8px;cursor:pointer;">&#8660; Flip</button>
        <button type="button" onclick="rotateCrop(90)" style="flex:1;padding:9px;background:#334155;color:#fff;border:none;border-radius:8px;cursor:pointer;">&#8635; Right</button>
      </div>
      <div style="display:flex;gap:10px;">
        <button type="button" onclick="closeCrop()" style="flex:1;padding:11px;background:transparent;color:#94a3b8;border:1.5px solid #475569;border-radius:8px;cursor:pointer;">Cancel</button>
        <button type="button" onclick="confirmCrop()" style="flex:2;padding:11px;background:#1e3a5f;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">&#10003; Use Image</button>
      </div>
    </div>
  </div>

  <h1 class="page-title">${greeting}</h1>
  <p class="page-sub">${campusName ? `You are registering staff for <strong>${esc(campusName)}</strong>. Complete each step and click Next — HR will review each submission.` : 'Complete each step and click Next. HR will review your registration.'}</p>

  <div class="wz-stepper">
    <div class="wz-step active" id="wdot-1"><div class="wz-dot">1</div><div class="wz-label">Personal</div></div>
    <div class="wz-step" id="wdot-2"><div class="wz-dot">2</div><div class="wz-label">Emergency &amp; Education</div></div>
    <div class="wz-step" id="wdot-3"><div class="wz-dot">3</div><div class="wz-label">Professional</div></div>
    <div class="wz-step" id="wdot-4"><div class="wz-dot">4</div><div class="wz-label">Documents</div></div>
  </div>

  <form id="onboardForm" method="POST" enctype="multipart/form-data" action="/onboarding/${encodeURIComponent(token)}">
    <input type="hidden" name="qualifications" id="qualificationsJson" value="[]" />

    <!-- STEP 1: Personal Details -->
    <div class="wizard-step active" id="step-1">
      <div class="section">
        <div class="section-head">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          Personal Details
        </div>
        <div class="section-body triple">
          <div><label>First Name *</label><input type="text" name="first_name" required placeholder="First name" /></div>
          <div><label>Middle Name</label><input type="text" name="middle_name" placeholder="Middle name" /></div>
          <div><label>Last Name *</label><input type="text" name="last_name" required placeholder="Last name" /></div>
          <div><label>Gender *</label>
            <select name="gender" required>
              <option value="">— Select —</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div><label>Date of Birth</label><input type="date" name="date_of_birth" /></div>
          <div><label>Nationality</label>
            <select name="nationality">
              <option value="">— Select —</option>
              ${natOptions}
            </select>
          </div>
          <div><label>National ID / NIN</label><input type="text" name="national_id" placeholder="CM9000XXXXX" /></div>
          <div><label>Passport No.</label><input type="text" name="passport_no" placeholder="e.g. A0000000" /></div>
          <div><label>Tribe / Ethnicity</label>
            <select name="tribe">
              <option value="">— Select —</option>
              ${tribeOptions}
            </select>
          </div>
          <div><label>Phone Number *</label><input type="tel" name="phone" required placeholder="e.g. 0700 123456" /></div>
          <div><label>Alternate Phone</label><input type="tel" name="phone2" placeholder="Second phone number" /></div>
          <div><label>WhatsApp Number</label><input type="tel" name="whatsapp_phone" placeholder="If different from phone" /></div>
          <div class="full"><label>Email Address</label><input type="email" name="email" placeholder="your@email.com" /></div>
          <div><label>Blood Group</label>
            <select name="blood_group">
              <option value="">— Select —</option>
              ${bloodOptions}
            </select>
          </div>
          <div><label>Religion</label>
            <select name="religion">
              <option value="">— Select —</option>
              ${religionOptions}
            </select>
          </div>
          <div><label>Marital Status</label>
            <select name="marital_status" id="marital_status" onchange="toggleSpouseFields(this.value)">
              <option value="">— Select —</option>
              ${maritalOptions}
            </select>
          </div>
          <div id="spouseFields" style="display:none;grid-column:1/-1;grid-template-columns:1fr 1fr 1fr;gap:14px;">
            <div><label>Spouse Full Name</label><input type="text" name="spouse_name" placeholder="Spouse's full name" /></div>
            <div><label>Spouse Phone</label><input type="tel" name="spouse_phone" placeholder="Spouse's phone number" /></div>
            <div><label>No. of Children</label><input type="number" min="0" max="30" name="no_of_children" placeholder="0" /></div>
          </div>
          <div class="full"><label>Parents' Full Names</label><input type="text" name="parents_names" placeholder="Father's name / Mother's name" /></div>
          <div class="full"><label>Residential Address</label><input type="text" name="residential_address" placeholder="Plot / Street / Zone, District" /></div>
          <div class="full"><label>Village / Home Area</label><input type="text" name="village" placeholder="Village, Sub-county, District" /></div>
        </div>
      </div>
    </div>

    <!-- STEP 2: Emergency + Education -->
    <div class="wizard-step" id="step-2">
      <div class="section">
        <div class="section-head">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11.5a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .84h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.63a16 16 0 006.29 6.29l1.95-1.16a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" stroke="currentColor" stroke-width="2"/></svg>
          Emergency / Next of Kin
        </div>
        <div class="section-body">
          <div><label>Full Name *</label><input type="text" name="ec_name" required placeholder="Next of kin full name" /></div>
          <div><label>Relationship *</label><input type="text" name="ec_relationship" required placeholder="e.g. Spouse, Parent, Sibling" /></div>
          <div><label>Phone Number *</label><input type="tel" name="ec_phone" required placeholder="Contact phone number" /></div>
          <div><label>Address</label><input type="text" name="ec_address" placeholder="Home / residential address" /></div>
        </div>
      </div>
      <div class="section">
        <div class="section-head">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M22 10v6M2 10l10-5 10 5-10 5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 12v5c3 3 9 3 12 0v-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Academic Qualifications
        </div>
        <div id="eduList" style="padding:12px 20px 0;display:flex;flex-direction:column;gap:12px;"></div>
        <div style="padding:12px 20px 20px;">
          <button type="button" class="add-btn" onclick="addEduRow()">+ Add Qualification</button>
        </div>
      </div>
    </div>

    <!-- STEP 3: Professional + Bank -->
    <div class="wizard-step" id="step-3">
      <div class="section">
        <div class="section-head">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Professional &amp; Skills
        </div>
        <div class="section-body single">
          <div><label>Subjects / Areas of Preference</label><textarea name="subjects_of_preference" placeholder="e.g. Mathematics, English, Physics, Chemistry…"></textarea></div>
          <div><label>Other Skills / Competencies</label><textarea name="other_skills" placeholder="e.g. ICT skills, First Aid, Music, Sports…"></textarea></div>
          <div><label>Earlier Responsibilities / Work Experience</label><textarea name="earlier_responsibilities" placeholder="List any previous teaching or work experience…"></textarea></div>
          <div><label>Special Courses / Certificates Attended</label><textarea name="special_courses" placeholder="e.g. Child protection training, CPD, workshops…"></textarea></div>
        </div>
      </div>
      <div class="section">
        <div class="section-head">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M16 7V5a2 2 0 00-4 0v2M12 12v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          Bank Account Details
        </div>
        <div class="section-body triple">
          <div><label>Bank Name</label><input type="text" name="bank_name" placeholder="e.g. Stanbic Bank Uganda" /></div>
          <div><label>Account Name</label><input type="text" name="account_name" placeholder="Name as on account" /></div>
          <div><label>Account Number</label><input type="text" name="account_number" placeholder="Account number" /></div>
          <div class="full"><label>Branch (Optional)</label><input type="text" name="bank_branch" placeholder="e.g. Kampala Main Branch" /></div>
        </div>
      </div>
    </div>

    <!-- STEP 4: Medical + Documents + Declaration -->
    <div class="wizard-step" id="step-4">
      <div class="section">
        <div class="section-head">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0016.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 002 8.5c0 2.3 1.5 4.05 3 5.5l7 7 7-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Medical Background
        </div>
        <div class="section-body single">
          <div><label>Any Medical Conditions / Allergies / Special Needs</label><textarea name="medical_background" placeholder="Describe any known conditions, chronic illnesses, allergies, disabilities, or special needs… (Leave blank if none)"></textarea></div>
          <div><label>Other Information (Optional)</label><textarea name="other_information" placeholder="Any other information you would like HR to know…"></textarea></div>
        </div>
      </div>
      <div class="section">
        <div class="section-head">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9l-7-7z" stroke="currentColor" stroke-width="2"/><path d="M13 2v7h7" stroke="currentColor" stroke-width="2"/></svg>
          Documents &amp; Uploads
        </div>
        <div class="section-body" style="grid-template-columns:1fr;">
          <p style="font-size:.82rem;color:#64748b;line-height:1.5;">Select one or more files per category. Tap a photo thumbnail to crop or rotate it. Max 10 MB per file.</p>

          <div class="upload-item">
            <label>Passport-Size Photo <span class="opt-tag rec">Recommended</span></label>
            <div class="upload-zone" onclick="document.getElementById('inpPhoto').click()">
              <input type="file" id="inpPhoto" name="photo" accept="image/jpeg,image/png,image/jpg" capture="environment" style="display:none" onchange="onPick(this,'photo')" />
              <span class="upload-hint">&#128247; Take or select a passport-style photo</span>
            </div>
            <img id="photoPreview" style="display:none;width:80px;height:100px;object-fit:cover;border-radius:8px;border:2px solid #e2e8f0;margin-top:8px;" alt="" />
            <div id="photo_grid" class="th-grid"></div>
          </div>

          <div class="upload-item">
            <label>National ID / Passport Scan <span class="opt-tag rec">Recommended</span></label>
            <div class="upload-zone" onclick="document.getElementById('inpNid').click()">
              <input type="file" id="inpNid" name="nid_scan" accept="image/jpeg,image/png,image/jpg,application/pdf" capture="environment" multiple style="display:none" onchange="onPick(this,'nid_scan')" />
              <span class="upload-hint">&#127996; Select image or PDF &mdash; multiple files allowed</span>
            </div>
            <div id="nid_scan_grid" class="th-grid"></div>
          </div>

          <div class="upload-item">
            <label>Academic Certificates <span class="opt-tag">Optional</span></label>
            <div class="upload-zone" onclick="document.getElementById('inpAcad').click()">
              <input type="file" id="inpAcad" name="academic_docs" accept="image/jpeg,image/png,image/jpg,application/pdf" capture="environment" multiple style="display:none" onchange="onPick(this,'academic_docs')" />
              <span class="upload-hint">&#127891; Select certificates &mdash; multiple files allowed</span>
            </div>
            <div id="academic_docs_grid" class="th-grid"></div>
          </div>

          <div class="upload-item">
            <label>CV / Resume <span class="opt-tag">Optional</span></label>
            <div class="upload-zone" onclick="document.getElementById('inpCv').click()">
              <input type="file" id="inpCv" name="cv" accept="application/pdf,image/jpeg,image/png" multiple style="display:none" onchange="onPick(this,'cv')" />
              <span class="upload-hint">&#128196; Select PDF or image &mdash; multiple files allowed</span>
            </div>
            <div id="cv_grid" class="th-grid"></div>
          </div>

          <div class="upload-item">
            <label>Other Supporting Documents <span class="opt-tag">Optional</span></label>
            <div class="upload-zone" onclick="document.getElementById('inpOther').click()">
              <input type="file" id="inpOther" name="other_docs" accept="image/jpeg,image/png,image/jpg,application/pdf" multiple style="display:none" onchange="onPick(this,'other_docs')" />
              <span class="upload-hint">&#128206; Any additional documents</span>
            </div>
            <div id="other_docs_grid" class="th-grid"></div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-body single">
          <div style="display:flex;gap:10px;align-items:flex-start;">
            <input type="checkbox" id="declare" style="width:20px;height:20px;flex-shrink:0;margin-top:2px;" />
            <label for="declare" style="text-transform:none;font-size:.85rem;color:#475569;font-weight:400;letter-spacing:0;">
              I declare that the information I have provided above is true and accurate to the best of my knowledge. I understand that providing false information may result in disciplinary action.
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation -->
    <div class="wz-nav">
      <button type="button" class="wz-back" id="backBtn" onclick="wizardBack()" style="display:none">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Back
      </button>
      <button type="button" class="wz-next" id="nextBtn" onclick="wizardNext()">
        Next
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button type="submit" class="wz-submit" id="submitBtn" style="display:none">
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Submit Registration
      </button>
    </div>
  </form>

  <script>
    const TOTAL_STEPS = 4;
    let currentStep = 1;

    function updateStepper() {
      for (let i = 1; i <= TOTAL_STEPS; i++) {
        const dot = document.getElementById('wdot-' + i);
        dot.classList.remove('active','done');
        if (i < currentStep) dot.classList.add('done');
        else if (i === currentStep) dot.classList.add('active');
      }
    }

    function showStep(n) {
      for (let i = 1; i <= TOTAL_STEPS; i++) {
        document.getElementById('step-'+i).classList.toggle('active', i===n);
      }
      document.getElementById('backBtn').style.display   = n > 1 ? '' : 'none';
      document.getElementById('nextBtn').style.display   = n < TOTAL_STEPS ? '' : 'none';
      document.getElementById('submitBtn').style.display = n === TOTAL_STEPS ? '' : 'none';
      updateStepper();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function wizardNext() {
      const stepEl = document.getElementById('step-' + currentStep);
      for (const el of stepEl.querySelectorAll('[required]')) {
        const empty = el.type === 'checkbox' ? !el.checked : !el.value.trim();
        if (empty) { el.reportValidity ? el.reportValidity() : null; el.focus(); return; }
      }
      if (currentStep < TOTAL_STEPS) { currentStep++; showStep(currentStep); }
    }

    function wizardBack() {
      if (currentStep > 1) { currentStep--; showStep(currentStep); }
    }

    function toggleSpouseFields(val) {
      const el = document.getElementById('spouseFields');
      el.style.display = (val==='married'||val==='divorced'||val==='widowed') ? 'grid' : 'none';
    }

    const eduData = [];
    const eduLevels = ${JSON.stringify(eduLevels)};
    function addEduRow(data) {
      const idx = eduData.length;
      data = data || { level:'undergraduate', institution:'', qualification:'', year_completed:'' };
      eduData.push(data);
      const div = document.createElement('div');
      div.className = 'edu-row';
      div.dataset.idx = idx;
      const levelOptions = eduLevels.map(l =>
        \`<option value="\${l.value}"\${data.level===l.value?' selected':''}>\${l.label}</option>\`
      ).join('');
      div.innerHTML = \`
        <button type="button" class="rm-btn" onclick="removeEdu(\${idx})">×</button>
        <div><label>Level</label><select onchange="eduData[\${idx}].level=this.value">\${levelOptions}</select></div>
        <div><label>Year Completed</label><input type="number" min="1960" max="2030" placeholder="e.g. 2015" value="\${data.year_completed||''}" onchange="eduData[\${idx}].year_completed=this.value" /></div>
        <div class="full"><label>Institution / School / University</label><input type="text" placeholder="Name of institution" value="\${data.institution||''}" oninput="eduData[\${idx}].institution=this.value" /></div>
        <div class="full"><label>Qualification / Award Obtained</label><input type="text" placeholder="e.g. Bachelor of Education, Uganda Certificate of Education" value="\${data.qualification||''}" oninput="eduData[\${idx}].qualification=this.value" /></div>
      \`;
      document.getElementById('eduList').appendChild(div);
      updateQualsJson();
    }
    function removeEdu(idx) {
      eduData[idx] = null;
      const el = document.querySelector('[data-idx="'+idx+'"]');
      if (el) el.remove();
      updateQualsJson();
    }
    function updateQualsJson() {
      document.getElementById('qualificationsJson').value = JSON.stringify(eduData.filter(Boolean));
    }

    var _uf={},_cc=null,_pCrop=null;
    function _gF(f){return _uf[f]||[];}
    function _sync(field){
      var inp=document.querySelector('[name="'+field+'"]');if(!inp)return;
      var dt=new DataTransfer();_gF(field).forEach(function(f){dt.items.add(f);});
      try{inp.files=dt.files;}catch(e){}
    }
    function rmF(field,idx){_uf[field].splice(idx,1);_sync(field);renderTh(field);}
    function renderTh(field){
      var grid=document.getElementById(field+'_grid');if(!grid)return;
      while(grid.firstChild)grid.removeChild(grid.firstChild);
      _gF(field).forEach(function(f,i){
        var d=document.createElement('div');d.className='th-item';
        var btn=document.createElement('button');btn.type='button';btn.className='th-rm';
        btn.textContent='\u00d7';btn.dataset.field=field;btn.dataset.idx=String(i);
        btn.addEventListener('click',function(){rmF(this.dataset.field,+this.dataset.idx);});
        var nm=document.createElement('div');nm.className='th-nm';nm.textContent=f.name.slice(0,22);
        if(f.type.startsWith('image/')){
          var img=document.createElement('img');img.className='th-img';
          img.src=URL.createObjectURL(f);img.title='Tap to rotate/crop';
          img.dataset.field=field;img.dataset.idx=String(i);
          img.addEventListener('click',function(){editImg(this.dataset.field,+this.dataset.idx);});
          d.appendChild(img);
        } else {
          var pdf=document.createElement('div');pdf.className='th-pdf';pdf.textContent='PDF';
          d.appendChild(pdf);
        }
        d.appendChild(btn);d.appendChild(nm);grid.appendChild(d);
      });
      var prev=document.getElementById('photoPreview');
      if(field==='photo'&&prev){
        var pf=_gF('photo');
        if(pf.length&&pf[0].type.startsWith('image/')){prev.src=URL.createObjectURL(pf[0]);prev.style.display='block';}
        else prev.style.display='none';
      }
    }
    function onPick(inp,field){
      var files=Array.from(inp.files);inp.value='';if(!files.length)return;
      if(field==='photo'){_pCrop={field:field,idx:-1};_openCrop(files[0]);}
      else{_uf[field]=(_uf[field]||[]).concat(files);_sync(field);renderTh(field);}
    }
    function editImg(field,idx){_pCrop={field:field,idx:idx};_openCrop(_uf[field][idx]);}
    function _openCrop(file){
      var modal=document.getElementById('cropModal');
      var cv=document.getElementById('cropCv');
      var img=new Image();
      img.onload=function(){
        var maxW=Math.min(window.innerWidth*0.84,440),dpr=window.devicePixelRatio||1;
        var isP=_pCrop.field==='photo',aspect=isP?(4/3):Math.min(img.height/img.width,0.7);
        cv.width=Math.round(maxW*dpr);cv.height=Math.round(maxW*aspect*dpr);
        cv.style.width=maxW+'px';cv.style.height=Math.round(maxW*aspect)+'px';
        _cc={img:img,r:0,fx:0,px:0,py:0,drag:0,lx:0,ly:0,dpr:dpr};
        _drawC();modal.style.display='flex';
      };
      img.src=URL.createObjectURL(file);
    }
    function _drawC(){
      var c=_cc;if(!c)return;
      var cv=document.getElementById('cropCv'),ctx=cv.getContext('2d'),W=cv.width,H=cv.height;
      ctx.clearRect(0,0,W,H);ctx.save();
      ctx.translate(W/2+c.px*c.dpr,H/2+c.py*c.dpr);ctx.rotate(c.r*Math.PI/180);
      if(c.fx)ctx.scale(-1,1);
      var rad=c.r%180,iw=rad===0?c.img.width:c.img.height,ih=rad===0?c.img.height:c.img.width;
      var sc=Math.max(W/iw,H/ih);
      ctx.drawImage(c.img,-c.img.width/2*sc,-c.img.height/2*sc,c.img.width*sc,c.img.height*sc);
      ctx.restore();
      var bx=W*.07,by=H*.07,bw=W*.86,bh=H*.86;
      ctx.fillStyle='rgba(0,0,0,.45)';
      ctx.fillRect(0,0,W,by);ctx.fillRect(0,by+bh,W,H);ctx.fillRect(0,by,bx,bh);ctx.fillRect(bx+bw,by,W,bh);
      ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=1.5*c.dpr;ctx.strokeRect(bx,by,bw,bh);
      var g=14*c.dpr;ctx.lineWidth=3*c.dpr;ctx.strokeStyle='#fff';ctx.beginPath();
      [[bx,by,g,g],[bx+bw,by,-g,g],[bx,by+bh,g,-g],[bx+bw,by+bh,-g,-g]].forEach(function(p){
        ctx.moveTo(p[0],p[1]+p[3]);ctx.lineTo(p[0],p[1]);ctx.lineTo(p[0]+p[2],p[1]);
      });ctx.stroke();
    }
    function rotateCrop(deg){if(!_cc)return;_cc.r=(_cc.r+deg+360)%360;_cc.px=0;_cc.py=0;_drawC();}
    function flipCrop(){if(!_cc)return;_cc.fx=!_cc.fx;_drawC();}
    function _cEv(e){
      if(!_cc)return;var pt=e.touches?e.touches[0]:e;
      if(e.type==='mousedown'||e.type==='touchstart'){_cc.drag=1;_cc.lx=pt.clientX;_cc.ly=pt.clientY;e.preventDefault();}
      else if((e.type==='mousemove'||e.type==='touchmove')&&_cc.drag){
        _cc.px+=pt.clientX-_cc.lx;_cc.py+=pt.clientY-_cc.ly;_cc.lx=pt.clientX;_cc.ly=pt.clientY;_drawC();e.preventDefault();
      } else if(e.type==='mouseup'||e.type==='touchend'){_cc.drag=0;}
    }
    function confirmCrop(){
      var c=_cc;if(!c)return;
      var cv=document.getElementById('cropCv'),W=cv.width,H=cv.height;
      var bx=W*.07,by=H*.07,bw=W*.86,bh=H*.86;
      var off=document.createElement('canvas');
      off.width=Math.round(bw*2.5/c.dpr);off.height=Math.round(bh*2.5/c.dpr);
      off.getContext('2d').drawImage(cv,bx,by,bw,bh,0,0,off.width,off.height);
      off.toBlob(function(blob){
        var field=_pCrop.field,file=new File([blob],field+'_edited.jpg',{type:'image/jpeg'});
        if(_pCrop.idx>=0)_uf[field][_pCrop.idx]=file;else _uf[field]=[file];
        _sync(field);renderTh(field);closeCrop();
      },'image/jpeg',.92);
    }
    function closeCrop(){document.getElementById('cropModal').style.display='none';_cc=null;_pCrop=null;}
    (function(){
      var cv=document.getElementById('cropCv');if(!cv)return;
      ['mousedown','mousemove','mouseup','touchstart','touchmove','touchend'].forEach(function(ev){
        cv.addEventListener(ev,_cEv,{passive:false});
      });
      document.addEventListener('mouseup',function(){if(_cc)_cc.drag=0;});
    })();

    document.getElementById('onboardForm').addEventListener('submit', function(e) {
      updateQualsJson();
      const decl = document.getElementById('declare');
      if (decl && !decl.checked) {
        e.preventDefault();
        alert('Please tick the declaration checkbox before submitting.');
        decl.focus();
        return;
      }
      const btn = document.getElementById('submitBtn');
      btn.disabled = true;
      btn.textContent = 'Submitting\u2026 please wait';
    });
  </script>`;
}


function buildForm(emp: Record<string, unknown>, token: string): string {
  const name = esc(`${emp.first_name} ${emp.middle_name ? emp.middle_name + ' ' : ''}${emp.last_name}`);
  // Every database value placed into the page goes through esc().
  const v = (val: unknown) => esc(val);

  return `
  <div id="cropModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;flex-direction:column;align-items:center;justify-content:center;padding:16px;">
    <div style="background:#1e293b;border-radius:14px;max-width:480px;width:100%;padding:16px;box-shadow:0 8px 40px rgba(0,0,0,.6);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="color:#fff;font-weight:700;font-size:1rem;">&#9986; Edit Image</span>
        <button type="button" onclick="closeCrop()" style="color:#94a3b8;background:none;border:none;font-size:1.6rem;cursor:pointer;line-height:1;">&times;</button>
      </div>
      <canvas id="cropCv" style="width:100%;border-radius:8px;cursor:grab;touch-action:none;display:block;background:#000;"></canvas>
      <p style="color:#94a3b8;font-size:.72rem;text-align:center;margin:8px 0 4px;">Drag to reposition &middot; Rotate/flip with buttons below</p>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button type="button" onclick="rotateCrop(-90)" style="flex:1;padding:9px;background:#334155;color:#fff;border:none;border-radius:8px;cursor:pointer;">&#8634; Left</button>
        <button type="button" onclick="flipCrop()" style="flex:1;padding:9px;background:#334155;color:#fff;border:none;border-radius:8px;cursor:pointer;">&#8660; Flip</button>
        <button type="button" onclick="rotateCrop(90)" style="flex:1;padding:9px;background:#334155;color:#fff;border:none;border-radius:8px;cursor:pointer;">&#8635; Right</button>
      </div>
      <div style="display:flex;gap:10px;">
        <button type="button" onclick="closeCrop()" style="flex:1;padding:11px;background:transparent;color:#94a3b8;border:1.5px solid #475569;border-radius:8px;cursor:pointer;">Cancel</button>
        <button type="button" onclick="confirmCrop()" style="flex:2;padding:11px;background:#1e3a5f;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">&#10003; Use Image</button>
      </div>
    </div>
  </div>
  <h1 class="page-title">Welcome, ${name}</h1>
  <p class="page-sub">Staff No: <strong>${esc(emp.staff_no)}</strong> &nbsp;·&nbsp; Please fill in your details below and submit. This link can only be used once.</p>

  <form id="onboardForm" method="POST" enctype="multipart/form-data" action="/onboarding/${encodeURIComponent(token)}">
    <input type="hidden" name="qualifications" id="qualificationsJson" value="[]" />

    <!-- Personal Information -->
    <div class="section">
      <div class="section-head">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        Personal Information
      </div>
      <div class="section-body">
        <div><label>Phone Number *</label><input type="tel" name="phone" value="${v(emp.phone)}" required placeholder="e.g. 0700 123456" /></div>
        <div><label>Phone 2 (Optional)</label><input type="tel" name="phone2" value="${v(emp.phone2)}" placeholder="Alternate phone" /></div>
        <div><label>WhatsApp Number</label><input type="tel" name="whatsapp_phone" value="${v(emp.whatsapp_phone)}" placeholder="If different from phone" /></div>
        <div><label>Email Address</label><input type="email" name="email" value="${v(emp.email)}" placeholder="your@email.com" /></div>
        <div><label>National ID / NIN</label><input type="text" name="national_id" value="${v(emp.national_id)}" placeholder="CM9000XXXXX" /></div>
        <div><label>Blood Group</label>
          <select name="blood_group">
            <option value="">— Select —</option>
            ${['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => `<option value="${g}"${v(emp.blood_group)===g?' selected':''}>${g}</option>`).join('')}
          </select>
        </div>
        <div><label>Religion</label>
          <select name="religion">
            <option value="">— Select —</option>
            ${['Catholic','Protestant/Anglican','Muslim','Seventh Day Adventist','Pentecostal','Orthodox','Other'].map(r => `<option value="${r}"${v(emp.religion)===r?' selected':''}>${r}</option>`).join('')}
          </select>
        </div>
        <div><label>Marital Status</label>
          <select name="marital_status">
            <option value="">— Select —</option>
            ${['single','married','divorced','widowed'].map(s => `<option value="${s}"${v(emp.marital_status)===s?' selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
          </select>
        </div>
        <div><label>Spouse Name</label><input type="text" name="spouse_name" value="${v(emp.spouse_name)}" placeholder="Full name of spouse" /></div>
        <div><label>Number of Children</label><input type="number" min="0" max="30" name="no_of_children" value="${v(emp.no_of_children)}" placeholder="0" /></div>
        <div class="full"><label>Residential Address</label><input type="text" name="residential_address" value="${v(emp.residential_address)}" placeholder="Plot/Street/Zone, District" /></div>
        <div class="full"><label>Village / Home Area</label><input type="text" name="village" value="${v(emp.village)}" placeholder="Village, Sub-county, District" /></div>
      </div>
    </div>

    <!-- Emergency Contact -->
    <div class="section">
      <div class="section-head">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11.5a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .84h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.63a16 16 0 006.29 6.29l1.95-1.16a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" stroke="currentColor" stroke-width="2"/></svg>
        Emergency / Next of Kin
      </div>
      <div class="section-body">
        <div><label>Full Name *</label><input type="text" name="ec_name" placeholder="Next of kin full name" /></div>
        <div><label>Relationship *</label><input type="text" name="ec_relationship" placeholder="e.g. Spouse, Parent, Sibling" /></div>
        <div><label>Phone Number *</label><input type="tel" name="ec_phone" placeholder="Contact phone" /></div>
        <div><label>Address</label><input type="text" name="ec_address" placeholder="Home / residential address" /></div>
      </div>
    </div>

    <!-- Academic Qualifications -->
    <div class="section">
      <div class="section-head">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M22 10v6M2 10l10-5 10 5-10 5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 12v5c3 3 9 3 12 0v-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Academic Qualifications
      </div>
      <div id="eduList" style="padding: 12px 20px 0; display: flex; flex-direction: column; gap: 12px;"></div>
      <div style="padding: 12px 20px 20px;">
        <button type="button" class="add-btn" onclick="addEduRow()">+ Add Qualification</button>
      </div>
    </div>

    <!-- Bank Details -->
    <div class="section">
      <div class="section-head">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M16 7V5a2 2 0 00-4 0v2M12 12v3M6 7V5a2 2 0 014 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        Bank Account Details
      </div>
      <div class="section-body triple">
        <div><label>Bank Name *</label><input type="text" name="bank_name" placeholder="e.g. Stanbic Bank Uganda" /></div>
        <div><label>Account Name *</label><input type="text" name="account_name" placeholder="Name on the account" /></div>
        <div><label>Account Number *</label><input type="text" name="account_number" placeholder="Account number" /></div>
        <div class="full"><label>Branch (Optional)</label><input type="text" name="bank_branch" placeholder="e.g. Kampala Main Branch" /></div>
      </div>
    </div>

    <!-- Medical Background -->
    <div class="section">
      <div class="section-head">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0016.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 002 8.5c0 2.3 1.5 4.05 3 5.5l7 7 7-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Medical Background
      </div>
      <div class="section-body single">
        <div>
          <label>Any Medical Conditions / Allergies / Special Needs</label>
          <textarea name="medical_background" placeholder="Describe any known medical conditions, chronic illnesses, allergies, disabilities, or special needs… (Leave blank if none)">${v(emp.medical_background)}</textarea>
        </div>
      </div>
    </div>

    <!-- Documents & Uploads -->
    <div class="section">
      <div class="section-head">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9l-7-7z" stroke="currentColor" stroke-width="2"/><path d="M13 2v7h7" stroke="currentColor" stroke-width="2"/></svg>
        Documents &amp; Uploads
      </div>
      <div class="section-body" style="grid-template-columns:1fr;">
        <p style="font-size:.82rem;color:#64748b;line-height:1.5;">Select one or more files per category. Tap a photo thumbnail to crop or rotate it. Max 10 MB per file.</p>

        <div class="upload-item">
          <label>Passport-Size Photo <span class="opt-tag rec">Recommended</span></label>
          <div class="upload-zone" onclick="document.getElementById('inpPhoto').click()">
            <input type="file" id="inpPhoto" name="photo" accept="image/jpeg,image/png,image/jpg" style="display:none" onchange="onPick(this,'photo')" />
            <span class="upload-hint">&#128247; Select a passport-style photo</span>
          </div>
          <img id="photoPreview" style="display:none;width:80px;height:100px;object-fit:cover;border-radius:8px;border:2px solid #e2e8f0;margin-top:8px;" alt="" />
          <div id="photo_grid" class="th-grid"></div>
        </div>

        <div class="upload-item">
          <label>National ID / Passport Scan <span class="opt-tag rec">Recommended</span></label>
          <div class="upload-zone" onclick="document.getElementById('inpNid').click()">
            <input type="file" id="inpNid" name="nid_scan" accept="image/jpeg,image/png,image/jpg,application/pdf" multiple style="display:none" onchange="onPick(this,'nid_scan')" />
            <span class="upload-hint">&#127996; Select image or PDF &mdash; multiple files allowed</span>
          </div>
          <div id="nid_scan_grid" class="th-grid"></div>
        </div>

        <div class="upload-item">
          <label>Academic Certificates <span class="opt-tag">Optional</span></label>
          <div class="upload-zone" onclick="document.getElementById('inpAcad').click()">
            <input type="file" id="inpAcad" name="academic_docs" accept="image/jpeg,image/png,image/jpg,application/pdf" multiple style="display:none" onchange="onPick(this,'academic_docs')" />
            <span class="upload-hint">&#127891; Select certificates &mdash; multiple files allowed</span>
          </div>
          <div id="academic_docs_grid" class="th-grid"></div>
        </div>

        <div class="upload-item">
          <label>CV / Resume <span class="opt-tag">Optional</span></label>
          <div class="upload-zone" onclick="document.getElementById('inpCv').click()">
            <input type="file" id="inpCv" name="cv" accept="application/pdf,image/jpeg,image/png" multiple style="display:none" onchange="onPick(this,'cv')" />
            <span class="upload-hint">&#128196; Select PDF or image &mdash; multiple files allowed</span>
          </div>
          <div id="cv_grid" class="th-grid"></div>
        </div>

        <div class="upload-item">
          <label>Other Supporting Documents <span class="opt-tag">Optional</span></label>
          <div class="upload-zone" onclick="document.getElementById('inpOther').click()">
            <input type="file" id="inpOther" name="other_docs" accept="image/jpeg,image/png,image/jpg,application/pdf" multiple style="display:none" onchange="onPick(this,'other_docs')" />
            <span class="upload-hint">&#128206; Any additional documents</span>
          </div>
          <div id="other_docs_grid" class="th-grid"></div>
        </div>
      </div>
    </div>

    <!-- Declaration -->
    <div class="section">
      <div class="section-body single">
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <input type="checkbox" id="declare" required style="width:18px;height:18px;flex-shrink:0;margin-top:2px;" />
          <label for="declare" style="text-transform:none;font-size:.85rem;color:#475569;font-weight:400;letter-spacing:0;">
            I declare that the information I have provided above is true and accurate to the best of my knowledge. I understand that providing false information may result in disciplinary action.
          </label>
        </div>
      </div>
    </div>

    <button type="submit" class="submit-btn" id="submitBtn">Submit My Information</button>
  </form>

  <script>
    const eduData = [];
    function addEduRow(data) {
      const idx = eduData.length;
      data = data || { level:'', institution:'', qualification:'', year_completed:'' };
      eduData.push(data);
      const div = document.createElement('div');
      div.className = 'edu-row';
      div.dataset.idx = idx;
      div.innerHTML = \`
        <button type="button" class="rm-btn" onclick="removeEdu(\${idx})">×</button>
        <div><label>Level</label>
          <select onchange="eduData[\${idx}].level=this.value">
            <option value="certificate">Certificate</option>
            <option value="diploma">Diploma</option>
            <option value="undergraduate">Bachelor's Degree</option>
            <option value="postgraduate">Master's / Postgrad</option>
            <option value="phd">PhD</option>
            <option value="other">Other</option>
          </select></div>
        <div><label>Year Completed</label><input type="number" min="1970" max="2030" placeholder="e.g. 2015" onchange="eduData[\${idx}].year_completed=this.value" /></div>
        <div class="full"><label>Institution / School / University</label><input type="text" placeholder="Name of institution" oninput="eduData[\${idx}].institution=this.value" /></div>
        <div class="full"><label>Qualification Obtained</label><input type="text" placeholder="e.g. Bachelor of Education" oninput="eduData[\${idx}].qualification=this.value" /></div>
      \`;
      document.getElementById('eduList').appendChild(div);
      updateQualsJson();
    }
    function removeEdu(idx) {
      eduData[idx] = null;
      const el = document.querySelector('[data-idx="'+idx+'"]');
      if (el) el.remove();
      updateQualsJson();
    }
    function updateQualsJson() {
      document.getElementById('qualificationsJson').value = JSON.stringify(eduData.filter(Boolean));
    }
    var _uf={},_cc=null,_pCrop=null;
    function _gF(f){return _uf[f]||[];}
    function _sync(field){
      var inp=document.querySelector('[name="'+field+'"]');if(!inp)return;
      var dt=new DataTransfer();_gF(field).forEach(function(f){dt.items.add(f);});
      try{inp.files=dt.files;}catch(e){}
    }
    function rmF(field,idx){_uf[field].splice(idx,1);_sync(field);renderTh(field);}
    function renderTh(field){
      var grid=document.getElementById(field+'_grid');if(!grid)return;
      while(grid.firstChild)grid.removeChild(grid.firstChild);
      _gF(field).forEach(function(f,i){
        var d=document.createElement('div');d.className='th-item';
        var btn=document.createElement('button');btn.type='button';btn.className='th-rm';
        btn.textContent='\u00d7';btn.dataset.field=field;btn.dataset.idx=String(i);
        btn.addEventListener('click',function(){rmF(this.dataset.field,+this.dataset.idx);});
        var nm=document.createElement('div');nm.className='th-nm';nm.textContent=f.name.slice(0,22);
        if(f.type.startsWith('image/')){
          var img=document.createElement('img');img.className='th-img';
          img.src=URL.createObjectURL(f);img.title='Tap to rotate/crop';
          img.dataset.field=field;img.dataset.idx=String(i);
          img.addEventListener('click',function(){editImg(this.dataset.field,+this.dataset.idx);});
          d.appendChild(img);
        } else {
          var pdf=document.createElement('div');pdf.className='th-pdf';pdf.textContent='PDF';
          d.appendChild(pdf);
        }
        d.appendChild(btn);d.appendChild(nm);grid.appendChild(d);
      });
      var prev=document.getElementById('photoPreview');
      if(field==='photo'&&prev){
        var pf=_gF('photo');
        if(pf.length&&pf[0].type.startsWith('image/')){prev.src=URL.createObjectURL(pf[0]);prev.style.display='block';}
        else prev.style.display='none';
      }
    }
    function onPick(inp,field){
      var files=Array.from(inp.files);inp.value='';if(!files.length)return;
      if(field==='photo'){_pCrop={field:field,idx:-1};_openCrop(files[0]);}
      else{_uf[field]=(_uf[field]||[]).concat(files);_sync(field);renderTh(field);}
    }
    function editImg(field,idx){_pCrop={field:field,idx:idx};_openCrop(_uf[field][idx]);}
    function _openCrop(file){
      var modal=document.getElementById('cropModal');
      var cv=document.getElementById('cropCv');
      var img=new Image();
      img.onload=function(){
        var maxW=Math.min(window.innerWidth*0.84,440),dpr=window.devicePixelRatio||1;
        var isP=_pCrop.field==='photo',aspect=isP?(4/3):Math.min(img.height/img.width,0.7);
        cv.width=Math.round(maxW*dpr);cv.height=Math.round(maxW*aspect*dpr);
        cv.style.width=maxW+'px';cv.style.height=Math.round(maxW*aspect)+'px';
        _cc={img:img,r:0,fx:0,px:0,py:0,drag:0,lx:0,ly:0,dpr:dpr};
        _drawC();modal.style.display='flex';
      };
      img.src=URL.createObjectURL(file);
    }
    function _drawC(){
      var c=_cc;if(!c)return;
      var cv=document.getElementById('cropCv'),ctx=cv.getContext('2d'),W=cv.width,H=cv.height;
      ctx.clearRect(0,0,W,H);ctx.save();
      ctx.translate(W/2+c.px*c.dpr,H/2+c.py*c.dpr);ctx.rotate(c.r*Math.PI/180);
      if(c.fx)ctx.scale(-1,1);
      var rad=c.r%180,iw=rad===0?c.img.width:c.img.height,ih=rad===0?c.img.height:c.img.width;
      var sc=Math.max(W/iw,H/ih);
      ctx.drawImage(c.img,-c.img.width/2*sc,-c.img.height/2*sc,c.img.width*sc,c.img.height*sc);
      ctx.restore();
      var bx=W*.07,by=H*.07,bw=W*.86,bh=H*.86;
      ctx.fillStyle='rgba(0,0,0,.45)';
      ctx.fillRect(0,0,W,by);ctx.fillRect(0,by+bh,W,H);ctx.fillRect(0,by,bx,bh);ctx.fillRect(bx+bw,by,W,bh);
      ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=1.5*c.dpr;ctx.strokeRect(bx,by,bw,bh);
      var g=14*c.dpr;ctx.lineWidth=3*c.dpr;ctx.strokeStyle='#fff';ctx.beginPath();
      [[bx,by,g,g],[bx+bw,by,-g,g],[bx,by+bh,g,-g],[bx+bw,by+bh,-g,-g]].forEach(function(p){
        ctx.moveTo(p[0],p[1]+p[3]);ctx.lineTo(p[0],p[1]);ctx.lineTo(p[0]+p[2],p[1]);
      });ctx.stroke();
    }
    function rotateCrop(deg){if(!_cc)return;_cc.r=(_cc.r+deg+360)%360;_cc.px=0;_cc.py=0;_drawC();}
    function flipCrop(){if(!_cc)return;_cc.fx=!_cc.fx;_drawC();}
    function _cEv(e){
      if(!_cc)return;var pt=e.touches?e.touches[0]:e;
      if(e.type==='mousedown'||e.type==='touchstart'){_cc.drag=1;_cc.lx=pt.clientX;_cc.ly=pt.clientY;e.preventDefault();}
      else if((e.type==='mousemove'||e.type==='touchmove')&&_cc.drag){
        _cc.px+=pt.clientX-_cc.lx;_cc.py+=pt.clientY-_cc.ly;_cc.lx=pt.clientX;_cc.ly=pt.clientY;_drawC();e.preventDefault();
      } else if(e.type==='mouseup'||e.type==='touchend'){_cc.drag=0;}
    }
    function confirmCrop(){
      var c=_cc;if(!c)return;
      var cv=document.getElementById('cropCv'),W=cv.width,H=cv.height;
      var bx=W*.07,by=H*.07,bw=W*.86,bh=H*.86;
      var off=document.createElement('canvas');
      off.width=Math.round(bw*2.5/c.dpr);off.height=Math.round(bh*2.5/c.dpr);
      off.getContext('2d').drawImage(cv,bx,by,bw,bh,0,0,off.width,off.height);
      off.toBlob(function(blob){
        var field=_pCrop.field,file=new File([blob],field+'_edited.jpg',{type:'image/jpeg'});
        if(_pCrop.idx>=0)_uf[field][_pCrop.idx]=file;else _uf[field]=[file];
        _sync(field);renderTh(field);closeCrop();
      },'image/jpeg',.92);
    }
    function closeCrop(){document.getElementById('cropModal').style.display='none';_cc=null;_pCrop=null;}
    (function(){
      var cv=document.getElementById('cropCv');if(!cv)return;
      ['mousedown','mousemove','mouseup','touchstart','touchmove','touchend'].forEach(function(ev){
        cv.addEventListener(ev,_cEv,{passive:false});
      });
      document.addEventListener('mouseup',function(){if(_cc)_cc.drag=0;});
    })();
    document.getElementById('onboardForm').addEventListener('submit', function(e) {
      updateQualsJson();
      const btn = document.getElementById('submitBtn');
      btn.disabled = true;
      btn.textContent = 'Submitting\u2026 please wait';
    });
    // Sync edu level selects after rendering
    document.querySelectorAll('.edu-row select').forEach((sel, i) => {
      sel.value = (eduData[i]||{}).level || 'undergraduate';
    });
  </script>`;
}
