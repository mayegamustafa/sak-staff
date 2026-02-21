import { useState, useEffect, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, UserPlus, GraduationCap, Plus, Trash2 } from 'lucide-react';

interface CampusOption  { id: string; name: string; code: string }
interface DeptOption    { id: string; name: string; code: string; campus_id: string | null }

const EA_NATIONALITIES = [
  'Ugandan', 'Kenyan', 'Tanzanian', 'Rwandan', 'Burundian',
  'South Sudanese', 'Congolese (DRC)', 'Ethiopian', 'Somali', 'Eritrean',
];

function NationalityField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isOther = value !== '' && !EA_NATIONALITIES.includes(value);
  return (
    <div className="space-y-2">
      <select
        className="input"
        value={isOther ? '__other__' : value}
        onChange={(e) => {
          if (e.target.value === '__other__') onChange('');
          else onChange(e.target.value);
        }}
      >
        {EA_NATIONALITIES.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
        <option value="__other__">Other (specify below)</option>
      </select>
      {isOther && (
        <input
          className="input"
          placeholder="Enter nationality"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

const PERSONAL_DEFAULTS = {
  firstName: '', middleName: '', lastName: '',
  gender: 'male' as const,
  dateOfBirth: '', nationality: 'Ugandan',
  nationalId: '', passportNo: '', maritalStatus: '',
  bloodGroup: '', religion: '',
  phone: '', phone2: '', email: '', residentialAddress: '',
};

const EMPLOYMENT_DEFAULTS = {
  campusId: '', departmentId: '', jobTitle: '',
  payGrade: '', contractType: 'permanent' as const,
  startDate: new Date().toISOString().slice(0, 10),
  salaryAmount: '', salaryCurrency: 'UGX',
};

export default function EmployeeFormPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = !!id;

  const [personal, setPersonal] = useState(PERSONAL_DEFAULTS);
  const [employment, setEmployment] = useState(EMPLOYMENT_DEFAULTS);
  const [tab, setTab] = useState<'personal' | 'academic' | 'employment'>('personal');
  const [error, setError] = useState('');

  // Education entries (pending for new; supplementary for edit)
  const [eduEntries, setEduEntries]   = useState<{ institution: string; qualification: string; fieldOfStudy: string; yearFrom: string; yearTo: string; grade: string }[]>([]);
  const [eduDraft,   setEduDraft]     = useState({ institution: '', qualification: '', fieldOfStudy: '', yearFrom: new Date().getFullYear().toString(), yearTo: new Date().getFullYear().toString(), grade: '' });
  const [eduErr,     setEduErr]       = useState('');

  // Load campuses + departments for selects
  const { data: campuses = [] } = useQuery<CampusOption[]>({
    queryKey: ['campuses'],
    queryFn: () => window.sakAPI.campuses.list() as Promise<CampusOption[]>,
  });

  const { data: allDepts = [] } = useQuery<DeptOption[]>({
    queryKey: ['departments'],
    queryFn: () => window.sakAPI.campuses.listDepartments() as Promise<DeptOption[]>,
  });

  const { data: jobTitles = [] } = useQuery<{ id: string; title: string; pay_grade: string | null }[]>({
    queryKey: ['job-titles'],
    queryFn: () => window.sakAPI.jobTitles.list({ active: 'true' }) as Promise<{ id: string; title: string; pay_grade: string | null }[]>,
  });

  // Load existing employee when editing
  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => window.sakAPI.employees.get(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (!existing) return;
    const e = existing as any;
    setPersonal({
      firstName: e.first_name ?? '',
      middleName: e.middle_name ?? '',
      lastName: e.last_name ?? '',
      gender: e.gender ?? 'male',
      dateOfBirth: e.date_of_birth?.slice(0, 10) ?? '',
      nationality: e.nationality ?? 'Ugandan',
      nationalId: e.national_id ?? '',
      passportNo: e.passport_no ?? '',
      maritalStatus: e.marital_status ?? '',
      bloodGroup: e.blood_group ?? '',
      religion: e.religion ?? '',
      phone: e.phone ?? '',
      phone2: e.phone2 ?? '',
      email: e.email ?? '',
      residentialAddress: e.residential_address ?? '',
    });
  }, [existing]);

  const existingEducation = isEdit ? ((existing as any)?.education ?? []) as { id: string; institution: string; qualification: string; field_of_study: string; year_from: number; year_to: number; grade?: string }[] : [];

  const deleteEdu = useMutation({
    mutationFn: (eduId: string) => window.sakAPI.employees.deleteEducation(id!, eduId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee', id] }),
  });

  const filteredDepts = allDepts; // Departments are org-wide — not filtered by station

  // ── Mutations ───────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        firstName:          personal.firstName,
        middleName:         personal.middleName || undefined,
        lastName:           personal.lastName,
        gender:             personal.gender,
        dateOfBirth:        personal.dateOfBirth,
        nationality:        personal.nationality,
        nationalId:         personal.nationalId || undefined,
        passportNo:         personal.passportNo || undefined,
        maritalStatus:      personal.maritalStatus || undefined,
        bloodGroup:         personal.bloodGroup || undefined,
        religion:           personal.religion || undefined,
        phone:              personal.phone,
        phone2:             personal.phone2 || undefined,
        email:              personal.email || undefined,
        residentialAddress: personal.residentialAddress || undefined,
      };

      if (isEdit) {
        return window.sakAPI.employees.update(id!, payload);
      }

      // Create employee then add employment record
      const emp = await window.sakAPI.employees.create(payload) as any;
      const empId = emp?.id ?? emp?.data?.id;
      if (!empId) throw new Error('Employee creation returned no ID');

      // Add employment if fields provided
      if (employment.campusId && employment.departmentId && employment.jobTitle) {
        await window.sakAPI.employment.create({
          employeeId:   empId,
          campusId:     employment.campusId,
          departmentId: employment.departmentId,
          jobTitle:     employment.jobTitle,
          payGrade:     employment.payGrade || undefined,
          contractType: employment.contractType,
          startDate:    employment.startDate,
        });

        if (employment.salaryAmount) {
          // Get employment record for this employee
          const empRecords = await window.sakAPI.employment.getByEmployee(empId) as any[];
          const empRecord = empRecords[0];
          if (empRecord?.id) {
            await window.sakAPI.employment.addSalary(empRecord.id, {
              amount:           Number(employment.salaryAmount),
              currency:         employment.salaryCurrency,
              paymentFrequency: 'monthly',
              effectiveDate:    employment.startDate,
            });
          }
        }
      }

      // Save education entries
      for (const edu of eduEntries) {
        await window.sakAPI.employees.addEducation(empId, {
          institution: edu.institution,
          qualification: edu.qualification,
          fieldOfStudy: edu.fieldOfStudy,
          yearFrom: edu.yearFrom,
          yearTo: edu.yearTo,
          grade: edu.grade || undefined,
        });
      }

      return { id: empId };
    },
    onSuccess: (result: any) => {
      const empId = result?.id ?? id;
      navigate(empId ? `/employees/${empId}` : '/employees');
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? e?.message ?? 'Save failed'),
  });

  if (isEdit && loadingExisting) {
    return <div className="p-6 text-slate-500">Loading…</div>;
  }

  const setPers = (k: keyof typeof personal) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setPersonal((p) => ({ ...p, [k]: e.target.value }));
  const setEmp = (k: keyof typeof employment) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setEmployment((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <UserPlus size={20} /> {isEdit ? 'Edit Staff Profile' : 'Add New Staff'}
          </h1>
          <p className="text-slate-400 text-sm">{isEdit ? 'Update personal biodata' : 'Register a new employee'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {([
          { key: 'personal',   label: 'Personal Info' },
          { key: 'academic',   label: 'Academic' },
          ...(!isEdit ? [{ key: 'employment', label: 'Employment' }] : []),
        ] as { key: 'personal' | 'academic' | 'employment'; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t.key
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); setError(''); save.mutate(); }}>

        {/* ── Personal Tab ─────────────────────────────────────────────────── */}
        {tab === 'personal' && (
          <div className="card space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label">First Name *</label>
                <input className="input" required value={personal.firstName} onChange={setPers('firstName')} />
              </div>
              <div>
                <label className="label">Middle Name</label>
                <input className="input" value={personal.middleName} onChange={setPers('middleName')} />
              </div>
              <div>
                <label className="label">Last Name *</label>
                <input className="input" required value={personal.lastName} onChange={setPers('lastName')} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Gender *</label>
                <select className="input" required value={personal.gender} onChange={setPers('gender')}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div>
                <label className="label">Date of Birth *</label>
                <input className="input" type="date" required value={personal.dateOfBirth} onChange={setPers('dateOfBirth')} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Nationality</label>
                <NationalityField value={personal.nationality} onChange={(v) => setPersonal((p) => ({ ...p, nationality: v }))} />
              </div>
              <div>
                <label className="label">Marital Status</label>
                <select className="input" value={personal.maritalStatus} onChange={setPers('maritalStatus')}>
                  <option value="">— Select —</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="divorced">Divorced</option>
                  <option value="widowed">Widowed</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">National ID</label>
                <input className="input" value={personal.nationalId} onChange={setPers('nationalId')} />
              </div>
              <div>
                <label className="label">Passport No</label>
                <input className="input" value={personal.passportNo} onChange={setPers('passportNo')} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Religion</label>
                <input className="input" value={personal.religion} onChange={setPers('religion')} />
              </div>
              <div>
                <label className="label">Blood Group</label>
                <select className="input" value={personal.bloodGroup} onChange={setPers('bloodGroup')}>
                  <option value="">— Select —</option>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                    <option key={bg} value={bg}>{bg}</option>
                  ))}
                </select>
              </div>
            </div>

            <hr className="border-slate-200 dark:border-slate-800" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Phone *</label>
                <input className="input" required value={personal.phone} onChange={setPers('phone')} />
              </div>
              <div>
                <label className="label">Phone 2</label>
                <input className="input" value={personal.phone2} onChange={setPers('phone2')} />
              </div>
            </div>

            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={personal.email} onChange={setPers('email')} />
            </div>

            <div>
              <label className="label">Residential Address</label>
              <textarea className="input resize-none" rows={2} value={personal.residentialAddress}
                onChange={(e) => setPersonal((p) => ({ ...p, residentialAddress: e.target.value }))} />
            </div>

            {!isEdit && (
              <div className="flex justify-end">
                <button type="button" className="btn-primary" onClick={() => setTab('academic')}>
                  Next: Academic →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Academic Tab ─────────────────────────────────────────────────── */}
        {tab === 'academic' && (
          <div className="space-y-4">

            {/* Existing education (edit mode) */}
            {isEdit && existingEducation.length > 0 && (
              <div className="card space-y-3">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2"><GraduationCap size={15} /> Saved Qualifications</h3>
                {existingEducation.map((e) => (
                  <div key={e.id} className="flex items-start justify-between gap-3 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{e.qualification}</p>
                      <p className="text-xs text-slate-500">{e.institution} · {e.field_of_study}</p>
                      <p className="text-xs text-slate-400">{e.year_from} – {e.year_to}{e.grade ? ` · ${e.grade}` : ''}</p>
                    </div>
                    <button type="button"
                      onClick={() => { if (confirm('Remove this qualification?')) deleteEdu.mutate(e.id); }}
                      className="p-1.5 text-slate-400 hover:text-red-400 transition-colors shrink-0" title="Remove">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {isEdit && existingEducation.length === 0 && (
              <p className="text-slate-400 text-sm">No academic records saved yet.</p>
            )}

            {/* Pending new entries (add mode) */}
            {!isEdit && eduEntries.length > 0 && (
              <div className="card space-y-3">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2"><GraduationCap size={15}/> Qualifications to Add</h3>
                {eduEntries.map((e, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{e.qualification}</p>
                      <p className="text-xs text-slate-500">{e.institution} · {e.fieldOfStudy}</p>
                      <p className="text-xs text-slate-400">{e.yearFrom} – {e.yearTo}{e.grade ? ` · ${e.grade}` : ''}</p>
                    </div>
                    <button type="button" onClick={() => setEduEntries((arr) => arr.filter((_, j) => j !== i))}
                      className="p-1.5 text-slate-400 hover:text-red-400 transition-colors shrink-0"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}

            {/* Add entry form */}
            <div className="card space-y-4">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <Plus size={14} /> {isEdit ? 'Add Qualification' : 'Add Academic Record'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Institution / School / University *</label>
                  <input className="input" placeholder="e.g. Makerere University" value={eduDraft.institution}
                    onChange={(e) => setEduDraft((d) => ({ ...d, institution: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Qualification / Award *</label>
                  <input className="input" placeholder="e.g. Bachelor of Education"
                    value={eduDraft.qualification}
                    onChange={(e) => setEduDraft((d) => ({ ...d, qualification: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Field / Subject *</label>
                  <input className="input" placeholder="e.g. Mathematics & ICT"
                    value={eduDraft.fieldOfStudy}
                    onChange={(e) => setEduDraft((d) => ({ ...d, fieldOfStudy: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Year From *</label>
                  <input className="input" type="number" min="1950" max="2099"
                    value={eduDraft.yearFrom}
                    onChange={(e) => setEduDraft((d) => ({ ...d, yearFrom: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Year To *</label>
                  <input className="input" type="number" min="1950" max="2099"
                    value={eduDraft.yearTo}
                    onChange={(e) => setEduDraft((d) => ({ ...d, yearTo: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Grade / Award Class</label>
                  <input className="input" placeholder="e.g. Second Class Upper, Distinction, Pass"
                    value={eduDraft.grade}
                    onChange={(e) => setEduDraft((d) => ({ ...d, grade: e.target.value }))} />
                </div>
              </div>
              {eduErr && <p className="text-red-400 text-sm">{eduErr}</p>}
              <div className="flex justify-between items-center flex-wrap gap-2">
                {isEdit ? (
                  <button type="button" className="btn-primary text-xs"
                    onClick={async () => {
                      setEduErr('');
                      if (!eduDraft.institution || !eduDraft.qualification || !eduDraft.fieldOfStudy) {
                        setEduErr('Institution, qualification and field are required'); return;
                      }
                      try {
                        await window.sakAPI.employees.addEducation(id!, {
                          institution: eduDraft.institution, qualification: eduDraft.qualification,
                          fieldOfStudy: eduDraft.fieldOfStudy, yearFrom: eduDraft.yearFrom,
                          yearTo: eduDraft.yearTo, grade: eduDraft.grade || undefined,
                        });
                        qc.invalidateQueries({ queryKey: ['employee', id] });
                        setEduDraft({ institution: '', qualification: '', fieldOfStudy: '', yearFrom: new Date().getFullYear().toString(), yearTo: new Date().getFullYear().toString(), grade: '' });
                      } catch (e: any) { setEduErr(e?.response?.data?.message ?? 'Failed'); }
                    }}>
                    <Plus size={13} /> Save Qualification
                  </button>
                ) : (
                  <button type="button" className="btn-secondary text-xs"
                    onClick={() => {
                      setEduErr('');
                      if (!eduDraft.institution || !eduDraft.qualification || !eduDraft.fieldOfStudy) {
                        setEduErr('Institution, qualification and field are required'); return;
                      }
                      setEduEntries((arr) => [...arr, { ...eduDraft }]);
                      setEduDraft({ institution: '', qualification: '', fieldOfStudy: '', yearFrom: new Date().getFullYear().toString(), yearTo: new Date().getFullYear().toString(), grade: '' });
                    }}>
                    <Plus size={13} /> Add to List
                  </button>
                )}
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary text-xs" onClick={() => setTab('personal')}>← Back</button>
                  {!isEdit && <button type="button" className="btn-primary text-xs" onClick={() => setTab('employment')}>Next: Employment →</button>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Employment Tab ────────────────────────────────────────────────── */}
        {tab === 'employment' && (
          <div className="card space-y-4">
            {isEdit && (
              <p className="text-sm text-amber-500 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2">
                Employment records are managed separately from the employee profile page.
              </p>
            )}

            {!isEdit && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Station *</label>
                    <select className="input" value={employment.campusId}
                      onChange={(e) => { setEmployment((p) => ({ ...p, campusId: e.target.value, departmentId: '' })); }}>
                      <option value="">— Select Station —</option>
                      {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Department *</label>
                    <select className="input" value={employment.departmentId}
                      onChange={setEmp('departmentId')}>
                      <option value="">— Select Department —</option>
                      {filteredDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Job Title *</label>
                    <input className="input" list="job-titles-list" value={employment.jobTitle} onChange={setEmp('jobTitle')} />
                    <datalist id="job-titles-list">
                      {jobTitles.map((jt) => (
                        <option key={jt.id} value={jt.title}>{jt.pay_grade ? `${jt.title} (${jt.pay_grade})` : jt.title}</option>
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="label">Pay Grade</label>
                    <input className="input" placeholder="e.g. U4, P2" value={employment.payGrade} onChange={setEmp('payGrade')} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Contract Type *</label>
                    <select className="input" value={employment.contractType} onChange={setEmp('contractType')}>
                      <option value="permanent">Permanent</option>
                      <option value="contract">Contract</option>
                      <option value="probation">Probation</option>
                      <option value="casual">Casual</option>
                      <option value="internship">Internship</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Start Date *</label>
                    <input className="input" type="date" value={employment.startDate} onChange={setEmp('startDate')} />
                  </div>
                </div>

                <hr className="border-slate-200 dark:border-slate-800" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Initial Salary (optional)</p>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="label">Amount</label>
                    <input className="input" type="number" min="0" step="0.01"
                      placeholder="e.g. 1500000"
                      value={employment.salaryAmount} onChange={setEmp('salaryAmount')} />
                  </div>
                  <div>
                    <label className="label">Currency</label>
                    <select className="input" value={employment.salaryCurrency} onChange={setEmp('salaryCurrency')}>
                      <option value="UGX">UGX</option>
                      <option value="USD">USD</option>
                      <option value="KES">KES</option>
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Error + Submit */}
        {error && <p className="text-red-400 text-sm px-1">{error}</p>}

        <div className="flex items-center justify-between pt-2">
          {tab === 'employment' && !isEdit && (
            <button type="button" className="btn-secondary" onClick={() => setTab('academic')}>
              ← Back
            </button>
          )}
          <div className="ml-auto">
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              <Save size={15} />
              {save.isPending ? 'Saving…' : isEdit ? 'Update Staff' : 'Save Staff'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
