import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';
import { generateStaffNo } from '@sak/shared';

const router = Router();
router.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/** Convert a DD-MM-YYYY string (from the Excel template) to YYYY-MM-DD for PostgreSQL.
 *  Returns null for empty/null input and passes through any value that doesn't
 *  match the DD-MM-YYYY pattern so data isn't silently lost. */
function parseDDMMYYYY(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = value.toString().trim();
  // Match DD-MM-YYYY
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // Already ISO YYYY-MM-DD — accept as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Excel serial number (numeric string)
  const serial = Number(s);
  if (!isNaN(serial) && serial > 1 && serial < 100000) {
    const d = XLSX.SSF.parse_date_code(serial);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  return s; // unknown format — pass through as-is
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/employees/bulk-import/template
// Returns a formatted .xlsx with Instructions, Staff, Education, WorkHistory,
// Referees sheets — including real campus/job-title lists and dropdowns.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/template', requirePermission('staff_profiles', 'create'), async (_req: Request, res: Response) => {
  // ── Fetch live reference data ─────────────────────────────────────────────
  const campuses  = (await db('campuses').where('is_active', true).orderBy('name').select('name')).map((r: {name: string}) => r.name);
  const jobTitles = (await db('job_titles').where('is_active', true).orderBy('title').select('title')).map((r: {title: string}) => r.title);

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Instructions ─────────────────────────────────────────────────
  const instrRows = [
    ['SAK SCHOOLS — STAFF DATA IMPORT TEMPLATE'],
    [''],
    ['HOW TO USE THIS FILE'],
    [''],
    ['1. Go to the STAFF sheet and fill in one row per staff member.'],
    ['2. Columns marked with * are REQUIRED — the row will be skipped if they are empty.'],
    ['3. For Campus and Job Title, pick the exact name from the REFERENCE sheet (copy-paste to avoid spelling errors).'],
    ['4. Dates must be in DD-MM-YYYY format  (e.g. 20-05-1990).'],
    ['5. For staff with multiple qualifications, add extra rows in the EDUCATION sheet using the same national_id.'],
    ['6. Use the WORK HISTORY sheet for previous jobs and REFEREES sheet for referee contacts.'],
    ['7. Delete this example row (row 2) from every sheet before uploading.'],
    ['8. Save the file as .xlsx (Excel Workbook) before uploading.'],
    [''],
    ['SHEETS IN THIS FILE'],
    ['  STAFF         — One row per staff member. Fill ALL relevant columns.'],
    ['  EDUCATION     — One row per qualification. Link to Staff via national_id.'],
    ['  WORK HISTORY  — Previous employment. Link via national_id.'],
    ['  REFEREES      — Referee contacts. Link via national_id.'],
    ['  REFERENCE     — Valid campus names and job titles. DO NOT EDIT THIS SHEET.'],
    [''],
    ['For help contact Mustafa +256 776003035.'],
  ];
  const instrWS = XLSX.utils.aoa_to_sheet(instrRows);
  instrWS['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, instrWS, 'Instructions');

  // ── Sheet 2: Staff ────────────────────────────────────────────────────────
  // NOTE: header names must be plain (no *) so the parser can match them by key.
  // Required fields are documented on the Instructions sheet only.
  const staffHeaders = [
    'national_id',         // REQUIRED — unique national ID / passport number
    'first_name',          // REQUIRED
    'last_name',           // REQUIRED
    'middle_name',
    'date_of_birth',       // DD-MM-YYYY
    'gender',              // dropdown: Male | Female
    'marital_status',      // dropdown: Single | Married | Divorced | Widowed
    'phone',               // REQUIRED
    'phone2',
    'email',
    'nationality',
    'tribe',
    'religion',
    'blood_group',         // dropdown: A+, A-, B+, B-, AB+, AB-, O+, O-
    'residential_address',
    'village',
    'passport_no',
    'nssf_number',
    'tin_number',
    'bank_name',
    'bank_account_number',
    'bank_branch',
    'campus_name',         // dropdown — pick from Reference sheet
    'job_title',           // dropdown — pick from Reference sheet
    'department',
    'contract_type',       // dropdown: Permanent | Contract | Part-time | Volunteer
    'start_date',          // DD-MM-YYYY
    'subjects_taught',     // comma-separated
    'other_skills',
    'emergency_contact_name',
    'emergency_contact_phone',
    'emergency_contact_relationship',
  ];
  const staffExample = [
    'CM12345678',
    'Jane',
    'Doe',
    'Mary',
    '1990-05-20',
    'Female',
    'Single',
    '+256700000000',
    '',
    'jane.doe@example.com',
    'Ugandan',
    '',
    'Christian',
    'O+',
    'Kampala, Uganda',
    '',
    '',
    'NSSF123456',
    'TIN987654321',
    'Stanbic Bank',
    '9030012345678',
    'Kampala Main Branch',
    campuses[0] ?? 'SAK - MENGO',
    jobTitles.find(t => t.toLowerCase().includes('teacher')) ?? 'Class Teacher',
    'Lower Primary',
    'Permanent',
    '2024-01-15',
    'Mathematics, English',
    '',
    'John Doe',
    '+256711000001',
    'Spouse',
  ];

  const staffWS = XLSX.utils.aoa_to_sheet([staffHeaders, staffExample]);

  // Column widths
  staffWS['!cols'] = staffHeaders.map(h => ({ wch: Math.max(h.length + 2, 20) }));

  // Freeze header row
  staffWS['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };

  // Data validation dropdowns (rows 2–500)
  const maxRow = 500;
  (staffWS as any)['!dataValidations'] = [
    {
      type: 'list', sqref: `F2:F${maxRow}`,
      formula1: '"Male,Female"',
      showDropDown: false, showErrorMessage: true,
      errorTitle: 'Invalid', error: 'Please select Male or Female',
    },
    {
      type: 'list', sqref: `G2:G${maxRow}`,
      formula1: '"Single,Married,Divorced,Widowed"',
      showDropDown: false, showErrorMessage: true,
      errorTitle: 'Invalid', error: 'Pick a value from the list',
    },
    {
      type: 'list', sqref: `Z2:Z${maxRow}`,
      formula1: '"Permanent,Contract,Part-time,Volunteer"',
      showDropDown: false, showErrorMessage: true,
      errorTitle: 'Invalid', error: 'Pick a value from the list',
    },
    // Campus dropdown — references Reference sheet column A
    {
      type: 'list', sqref: `W2:W${maxRow}`,
      formula1: `Reference!$A$2:$A$${campuses.length + 1}`,
      showDropDown: false, showErrorMessage: true,
      errorTitle: 'Invalid campus', error: 'Must match a campus on the Reference sheet',
    },
    // Job title dropdown — references Reference sheet column B
    {
      type: 'list', sqref: `X2:X${maxRow}`,
      formula1: `Reference!$B$2:$B$${jobTitles.length + 1}`,
      showDropDown: false, showErrorMessage: true,
      errorTitle: 'Invalid job title', error: 'Must match a job title on the Reference sheet',
    },
  ];

  XLSX.utils.book_append_sheet(wb, staffWS, 'Staff');

  // ── Sheet 3: Education ────────────────────────────────────────────────────
  const eduHeaders = ['national_id', 'institution', 'qualification', 'field_of_study', 'year_from', 'year_to', 'grade'];
  const eduExample  = ['CM12345678', 'Makerere University', 'Bachelor of Education', 'Primary Education', '2008', '2012', 'Second Class Upper'];
  const eduWS = XLSX.utils.aoa_to_sheet([eduHeaders, eduExample]);
  eduWS['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 26 }, { wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 22 }];
  eduWS['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };
  XLSX.utils.book_append_sheet(wb, eduWS, 'Education');

  // ── Sheet 4: WorkHistory ──────────────────────────────────────────────────
  const whHeaders = ['national_id', 'organisation', 'job_title', 'period_from', 'period_to', 'supervisor_name'];
  const whExample  = ['CM12345678', 'Uganda Schools Ltd', 'Assistant Teacher', '2012-01', '2018-12', 'Mr. Smith'];
  const whWS = XLSX.utils.aoa_to_sheet([whHeaders, whExample]);
  whWS['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 22 }];
  whWS['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };
  XLSX.utils.book_append_sheet(wb, whWS, 'WorkHistory');

  // ── Sheet 5: Referees ─────────────────────────────────────────────────────
  const refHeaders = ['national_id', 'name', 'title', 'phone', 'email', 'address'];
  const refExample  = ['CM12345678', 'Dr. Alice Nambi', 'Head Teacher', '+256700000002', 'alice@school.ug', 'Entebbe, Uganda'];
  const refWS = XLSX.utils.aoa_to_sheet([refHeaders, refExample]);
  refWS['!cols'] = [{ wch: 18 }, { wch: 26 }, { wch: 20 }, { wch: 18 }, { wch: 26 }, { wch: 28 }];
  refWS['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };
  XLSX.utils.book_append_sheet(wb, refWS, 'Referees');

  // ── Sheet 6: Reference (valid values) ────────────────────────────────────
  const refDataRows: string[][] = [
    ['CAMPUS NAMES (copy exact)', 'JOB TITLES (copy exact)', 'GENDER', 'CONTRACT TYPE', 'MARITAL STATUS', 'BLOOD GROUP'],
  ];
  const maxLen = Math.max(campuses.length, jobTitles.length, 4);
  const genders       = ['Male', 'Female'];
  const contracts     = ['Permanent', 'Contract', 'Part-time', 'Volunteer'];
  const maritalOpts   = ['Single', 'Married', 'Divorced', 'Widowed'];
  const bloodGroups   = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  for (let i = 0; i < maxLen; i++) {
    refDataRows.push([
      campuses[i]    ?? '',
      jobTitles[i]   ?? '',
      genders[i]     ?? '',
      contracts[i]   ?? '',
      maritalOpts[i] ?? '',
      bloodGroups[i] ?? '',
    ]);
  }
  const refDataWS = XLSX.utils.aoa_to_sheet(refDataRows);
  refDataWS['!cols'] = [{ wch: 42 }, { wch: 32 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, refDataWS, 'Reference');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="sak-staff-import-template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/employees/bulk-import/preview
// Accepts: multipart file field "file" (.xlsx)
// Returns: { valid: ParsedRow[], errors: {row, message}[] }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/preview', requirePermission('staff_profiles', 'create'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });

    // Parse sheets
    const staffRows    = sheetToObjects(wb, 'Staff');
    const eduRows      = sheetToObjects(wb, 'Education');
    const whRows       = sheetToObjects(wb, 'WorkHistory');
    const refRows      = sheetToObjects(wb, 'Referees');

    const errors: { row: number; national_id?: string; message: string }[] = [];
    const valid: ParsedEmployee[] = [];

    for (let i = 0; i < staffRows.length; i++) {
      const rowNum = i + 2; // 1-indexed + header
      const s = staffRows[i] as Record<string, string>;

      const national_id = (s.national_id || '').trim();
      const first_name  = (s.first_name  || '').trim();
      const last_name   = (s.last_name   || '').trim();
      const phone       = (s.phone       || '').trim();

      if (!national_id) { errors.push({ row: rowNum, message: 'national_id is required' }); continue; }
      if (!first_name)  { errors.push({ row: rowNum, national_id, message: 'first_name is required' }); continue; }
      if (!last_name)   { errors.push({ row: rowNum, national_id, message: 'last_name is required' }); continue; }
      if (!phone)       { errors.push({ row: rowNum, national_id, message: 'phone is required' }); continue; }

      // Check for duplicate national_id within upload
      if (valid.find(v => v.national_id === national_id)) {
        errors.push({ row: rowNum, national_id, message: 'duplicate national_id in file' }); continue;
      }

      const education    = eduRows.filter((r: Record<string,string>) => r.national_id === national_id);
      const work_history = whRows.filter((r: Record<string,string>) => r.national_id === national_id);
      const referees     = refRows.filter((r: Record<string,string>) => r.national_id === national_id);

      const t = (key: string) => (s[key] || '').toString().trim() || null;
      valid.push({
        national_id,
        first_name,
        last_name,
        middle_name:         t('middle_name'),
        date_of_birth:       parseDDMMYYYY(t('date_of_birth')),
        gender:              t('gender'),
        marital_status:      t('marital_status'),
        phone,
        phone2:              t('phone2'),
        email:               t('email'),
        nationality:         t('nationality'),
        tribe:               t('tribe'),
        religion:            t('religion'),
        blood_group:         t('blood_group'),
        residential_address: t('residential_address'),
        village:             t('village'),
        passport_no:         t('passport_no'),
        nssf_number:         t('nssf_number'),
        tin_number:          t('tin_number'),
        bank_name:           t('bank_name'),
        bank_account_number: t('bank_account_number'),
        bank_branch:         t('bank_branch'),
        campus_name:         t('campus_name'),
        job_title:           t('job_title'),
        department:          t('department'),
        contract_type:       t('contract_type'),
        start_date:          parseDDMMYYYY(t('start_date')),
        subjects_taught:     t('subjects_taught'),
        other_skills:        t('other_skills'),
        emergency_contact_name:         t('emergency_contact_name'),
        emergency_contact_phone:        t('emergency_contact_phone'),
        emergency_contact_relationship: t('emergency_contact_relationship'),
        education,
        work_history,
        referees,
      });
    }

    res.json({ valid, errors, total: staffRows.length });
  } catch (err) {
    const msg = (err as Error).message;
    res.status(400).json({ message: `Failed to parse file: ${msg}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/employees/bulk-import/confirm
// Accepts: { rows: ParsedEmployee[] }
// Creates employees + related records
// ─────────────────────────────────────────────────────────────────────────────
router.post('/confirm', requirePermission('staff_profiles', 'create'), async (req: Request, res: Response) => {
  const { rows } = req.body as { rows: ParsedEmployee[] };
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: 'No rows to import' });
  }

  const created: string[] = [];
  const errors: { name: string; message: string }[] = [];

  // Fetch lookup tables once
  const campuses   = await db('campuses').select('id', 'name', 'code');
  const jobTitles  = await db('job_titles').select('id', 'title');

  for (const row of rows) {
    const fullName = `${row.first_name} ${row.last_name}`;
    try {
      await db.transaction(async (trx) => {
        // Resolve campus
        let campusId: string | null = null;
        if (row.campus_name) {
          const c = campuses.find(x => x.name.toLowerCase() === row.campus_name!.toLowerCase());
          if (c) campusId = c.id;
        }

        // Resolve job title
        let jobTitleId: string | null = null;
        if (row.job_title) {
          const jt = jobTitles.find(x => x.title.toLowerCase() === row.job_title!.toLowerCase());
          if (jt) jobTitleId = jt.id;
        }

        const employeeId = uuidv4();

        // Generate staff number using current count within transaction
        const year = row.start_date ? new Date(row.start_date).getFullYear() : new Date().getFullYear();
        const [{ count }] = await trx('employees').count('id as count');
        const campusRow = campuses.find((x: any) => x.id === campusId);
        const staffNo = generateStaffNo(year, Number(count) + 1, campusRow?.code ?? null);

        // Create employee
        await trx('employees').insert({
          id:                  employeeId,
          staff_no:            staffNo,
          first_name:          row.first_name,
          last_name:           row.last_name,
          middle_name:         row.middle_name,
          date_of_birth:       parseDDMMYYYY(row.date_of_birth),
          gender:              row.gender,
          marital_status:      row.marital_status,
          phone:               row.phone,
          phone2:              row.phone2,
          email:               row.email,
          nationality:         row.nationality,
          tribe:               row.tribe,
          religion:            row.religion,
          blood_group:         row.blood_group,
          residential_address: row.residential_address,
          village:             row.village,
          passport_no:         row.passport_no,
          national_id:         row.national_id,
          nssf_number:         row.nssf_number,
          tin_number:          row.tin_number,
          campus_id:           campusId,
          job_title_id:        jobTitleId,
          department:          row.department,
          subjects_taught:     row.subjects_taught,
          other_skills:        row.other_skills,
          is_active:           true,
          created_at:          new Date(),
          updated_at:          new Date(),
        });

        // Bank details
        if (row.bank_name || row.bank_account_number) {
          await trx('bank_details').insert({
            id:             uuidv4(),
            employee_id:    employeeId,
            bank_name:      row.bank_name,
            account_number: row.bank_account_number,
            branch:         row.bank_branch,
            created_at:     new Date(),
            updated_at:     new Date(),
          });
        }

        // Employment record
        if (campusId || row.contract_type || row.start_date) {
          await trx('employments').insert({
            id:            uuidv4(),
            employee_id:   employeeId,
            campus_id:     campusId,
            job_title_id:  jobTitleId,
            contract_type: row.contract_type,
            start_date:    parseDDMMYYYY(row.start_date),
            status:        'active',
            created_at:    new Date(),
            updated_at:    new Date(),
          });
        }

        // Emergency contact
        if (row.emergency_contact_name) {
          await trx('emergency_contacts').insert({
            id:           uuidv4(),
            employee_id:  employeeId,
            name:         row.emergency_contact_name,
            phone:        row.emergency_contact_phone,
            relationship: row.emergency_contact_relationship,
            created_at:   new Date(),
            updated_at:   new Date(),
          });
        }

        // Education
        for (const edu of (row.education || [])) {
          const e = edu as Record<string, string>;
          if (!e.institution) continue;
          await trx('education').insert({
            id:             uuidv4(),
            employee_id:    employeeId,
            institution:    e.institution,
            qualification:  e.qualification,
            field_of_study: e.field_of_study,
            year_from:      e.year_from ? parseInt(e.year_from) : null,
            year_to:        e.year_to   ? parseInt(e.year_to)   : null,
            grade:          e.grade,
            created_at:     new Date(),
            updated_at:     new Date(),
          });
        }

        // Work history
        for (const wh of (row.work_history || [])) {
          const w = wh as Record<string, string>;
          if (!w.organisation) continue;
          await trx('work_history').insert({
            id:               uuidv4(),
            employee_id:      employeeId,
            organisation:     w.organisation,
            job_title:        w.job_title,
            period_from:      w.period_from,
            period_to:        w.period_to,
            supervisor_name:  w.supervisor_name,
            created_at:       new Date(),
            updated_at:       new Date(),
          });
        }

        // Referees
        for (const ref of (row.referees || [])) {
          const r = ref as Record<string, string>;
          if (!r.name) continue;
          await trx('referees').insert({
            id:           uuidv4(),
            employee_id:  employeeId,
            name:         r.name,
            title:        r.title,
            phone:        r.phone,
            email:        r.email,
            address:      r.address,
            created_at:   new Date(),
            updated_at:   new Date(),
          });
        }
      });

      created.push(fullName);
    } catch (err) {
      const msg = (err as Error).message;
      // Detect duplicate national_id
      if (msg.includes('unique') || msg.includes('UNIQUE') || msg.includes('duplicate')) {
        errors.push({ name: fullName, message: `National ID ${row.national_id} already exists in the system` });
      } else {
        errors.push({ name: fullName, message: msg });
      }
    }
  }

  res.json({ created: created.length, createdNames: created, errors });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function sheetToObjects(wb: XLSX.WorkBook, sheetName: string): Record<string, string>[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
}

interface ParsedEmployee {
  national_id: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  phone: string;
  phone2: string | null;
  email: string | null;
  nationality: string | null;
  tribe: string | null;
  religion: string | null;
  blood_group: string | null;
  residential_address: string | null;
  village: string | null;
  passport_no: string | null;
  nssf_number: string | null;
  tin_number: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_branch: string | null;
  campus_name: string | null;
  job_title: string | null;
  department: string | null;
  contract_type: string | null;
  start_date: string | null;
  subjects_taught: string | null;
  other_skills: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  education: unknown[];
  work_history: unknown[];
  referees: unknown[];
}

export default router;
