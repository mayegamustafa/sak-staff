import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, UserPlus, GraduationCap, Plus, Trash2, Briefcase, Users, User, Heart, MapPin, ClipboardList, PenLine, Building2, Printer, Upload, ChevronLeft, ChevronRight, Pencil, X, Activity, CreditCard } from 'lucide-react';
import SignaturePad from '../components/SignaturePad';
import { writePrintDocument } from '../lib/printWindow';

/* ────────────────── Interfaces ────────────────── */
interface CampusOption  { id: string; name: string; code: string }
interface DeptOption    { id: string; name: string; code: string; campus_id: string | null }

/* ────────────────── Lookup data ────────────────── */
const UGANDA_TRIBES = [
  'Baganda','Banyankore','Basoga','Bakiga','Iteso','Langi','Acholi','Lugbara',
  'Banyoro','Batoro','Bagisu','Karamojong','Alur','Bafumbira','Basamia','Bagwere',
  'Banyole','Baamba','Bakonzo','Batwa','Lendu','Madi','Kakwa','Nubian','Jonam',
  'Japadhola','Kumam','Aringa','Sabiny','Tepeth','Pokot','Ik','Lugisu','Bagungu',
  'Banyabindi','Baruli','Bavuma','Batooro',
].sort();

const EA_NATIONALITIES = [
  'Ugandan','Kenyan','Tanzanian','Rwandan','Burundian',
  'South Sudanese','Congolese (DRC)','Ethiopian','Somali','Eritrean',
];

/* ────────────────── Default state ────────────────── */
const DEF_PERSONAL = {
  firstName:'', middleName:'', lastName:'',
  gender: 'male' as 'male'|'female'|'other',
  dateOfBirth:'', nationality:'Ugandan',
  nationalId:'', passportNo:'',
  maritalStatus:'', bloodGroup:'', religion:'', tribe:'',
  phone:'', phone2:'', whatsappPhone:'', email:'',
  residentialAddress:'',
  dateAppointed:'', typeOfWork:'',
  spouseName:'', spousePhone:'', noOfChildren:'',
  tin:'', nssfNumber:'',
};
const DEF_RESIDENCE = {
  currentZone:'', landlordName:'', fatherName:'', motherName:'',
  village:'', villageZone:'', villageDirection:'',
};
const DEF_EXTENDED = {
  otherJobInterests:'', earlierResponsibilities:'',
  specialCourses:'', otherSkills:'', subjectsOfPreference:'',
  medicalBackground:'', otherInformation:'',
};
const DEF_DECLARATION = {
  declarationName:'', declarationTitle:'', declarationSignature:'',
  declarationDate: new Date().toISOString().slice(0,10),
  witnessName:'', witnessTitle:'', witnessSignature:'', witnessTel:'',
};
const DEF_EMPLOYMENT = {
  campusId:'', departmentId:'', jobTitle:'',
  payGrade:'', contractType:'permanent' as const,
  startDate: new Date().toISOString().slice(0,10),
  salaryAmount:'', salaryCurrency:'UGX',
};
const DEF_EDU_DRAFT = {
  institution:'', qualification:'', fieldOfStudy:'',
  yearFrom: new Date().getFullYear().toString(),
  yearTo: new Date().getFullYear().toString(),
  grade:'', honours:'',
};
const DEF_WORK_DRAFT = { periodFrom:'', periodTo:'', organisation:'', title:'', supervisorName:'' };
const DEF_REFEREE = { name:'', title:'', phone:'', email:'', address:'' };

/* ────────────────── Section Header ────────────────── */
function SectionHdr({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1 mb-1">
      <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{children}</span>
      <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
    </div>
  );
}

type TabKey = 'biodata'|'academic'|'work'|'nextOfKin'|'residence'|'referees'|'other'|'payroll'|'medical'|'employment'|'declaration';

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function EmployeeFormPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = !!id;
  const hasPopulated = useRef(false);

  const [tab, setTab]       = useState<TabKey>('biodata');
  const [error, setError]   = useState('');
  const [scannedFile, setScannedFile] = useState<File|null>(null);

  const [personal, setPersonal]   = useState(DEF_PERSONAL);
  const [residence, setResidence] = useState(DEF_RESIDENCE);
  const [extended, setExtended]   = useState(DEF_EXTENDED);
  const [decl, setDecl]           = useState(DEF_DECLARATION);
  const [empForm, setEmpForm]     = useState(DEF_EMPLOYMENT);

  const [eduEntries, setEduEntries] = useState<typeof DEF_EDU_DRAFT[]>([]);
  const [eduDraft, setEduDraft]     = useState(DEF_EDU_DRAFT);
  const [eduErr, setEduErr]         = useState('');
  const [eduEditId, setEduEditId]   = useState<string|null>(null);
  const [eduPendingIdx, setEduPendingIdx] = useState<number|null>(null);

  const [workEntries, setWorkEntries] = useState<typeof DEF_WORK_DRAFT[]>([]);
  const [workDraft, setWorkDraft]     = useState(DEF_WORK_DRAFT);
  const [workErr, setWorkErr]         = useState('');
  const [workEditId, setWorkEditId]   = useState<string|null>(null);
  const [workPendingIdx, setWorkPendingIdx] = useState<number|null>(null);

  const [referees, setReferees] = useState([{ ...DEF_REFEREE }, { ...DEF_REFEREE }, { ...DEF_REFEREE }]);
  const [refErr, setRefErr]     = useState('');

  const [nextOfKin, setNextOfKin] = useState({ name:'', relation:'', address:'', phone:'' });

  /* ── Remote data ─────────────────────────────────── */
  const { data: campuses = [] } = useQuery<CampusOption[]>({
    queryKey:['campuses'], queryFn:() => window.sakAPI.campuses.list() as Promise<CampusOption[]>,
  });
  const { data: allDepts = [] } = useQuery<DeptOption[]>({
    queryKey:['departments'], queryFn:() => window.sakAPI.campuses.listDepartments() as Promise<DeptOption[]>,
  });
  const { data: jobTitles = [] } = useQuery<{ id:string; title:string; pay_grade:string|null }[]>({
    queryKey:['job-titles'], queryFn:() => window.sakAPI.jobTitles.list({ active:'true' }) as Promise<{ id:string; title:string; pay_grade:string|null }[]>,
  });

  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey:['employee', id], queryFn:() => window.sakAPI.employees.get(id!), enabled:isEdit,
    staleTime: 60_000,
  });

  /* Fetch latest employment record for edit mode */
  const { data: existingEmployments = [] } = useQuery<any[]>({
    queryKey: ['employment', id],
    queryFn: () => window.sakAPI.employment.getByEmployee(id!) as Promise<any[]>,
    enabled: isEdit,
    staleTime: 60_000,
  });

  /* ── Populate from existing ──────────────────────── */
  useEffect(() => {
    if (!existing) return;
    // Only populate once per mount to avoid overwriting unsaved edits on background refetch
    if (hasPopulated.current) return;
    hasPopulated.current = true;
    const e = existing as any;
    setPersonal({
      firstName:      e.first_name ?? '',
      middleName:     e.middle_name ?? '',
      lastName:       e.last_name ?? '',
      gender:         e.gender ?? 'male',
      dateOfBirth:    e.date_of_birth?.slice(0,10) ?? '',
      nationality:    e.nationality ?? 'Ugandan',
      nationalId:     e.national_id ?? '',
      passportNo:     e.passport_no ?? '',
      maritalStatus:  e.marital_status ?? '',
      bloodGroup:     e.blood_group ?? '',
      religion:       e.religion ?? '',
      tribe:          e.tribe ?? '',
      phone:          e.phone ?? '',
      phone2:         e.phone2 ?? '',
      whatsappPhone:  e.whatsapp_phone ?? '',
      email:          e.email ?? '',
      residentialAddress: e.residential_address ?? '',
      dateAppointed:  e.date_appointed?.slice(0,10) ?? '',
      typeOfWork:     e.type_of_work ?? '',
      spouseName:     e.spouse_name ?? '',
      spousePhone:    e.spouse_phone ?? '',
      noOfChildren:   e.no_of_children?.toString() ?? '',
      tin:            e.tin ?? '',
      nssfNumber:     e.nssf_number ?? '',
    });
    setResidence({
      currentZone:      e.current_zone ?? '',
      landlordName:     e.landlord_name ?? '',
      fatherName:       (() => { const s = e.parents_names ?? ''; const m = /Father:\s*(.+?)(?:\s{2,}Mother:|$)/i.exec(s); return m ? m[1].trim() : (/Mother:/i.test(s) ? '' : s); })(),
      motherName:       (() => { const m = /Mother:\s*(.+?)$/i.exec(e.parents_names ?? ''); return m ? m[1].trim() : ''; })(),
      village:          e.village ?? '',
      villageZone:      e.village_zone ?? '',
      villageDirection: e.village_direction ?? '',
    });
    setExtended({
      otherJobInterests:       e.other_job_interests ?? '',
      earlierResponsibilities: e.earlier_responsibilities ?? '',
      specialCourses:          e.special_courses ?? '',
      otherSkills:             e.other_skills ?? '',
      subjectsOfPreference:    e.subjects_of_preference ?? '',
      medicalBackground:       e.medical_background ?? '',
      otherInformation:        e.other_information ?? '',
    });
    setDecl({
      declarationName:      e.declaration_name ?? '',
      declarationTitle:     e.declaration_title ?? '',
      declarationSignature: e.declaration_signature ?? '',
      declarationDate:      e.declaration_date?.slice(0,10) ?? new Date().toISOString().slice(0,10),
      witnessName:          e.witness_name ?? '',
      witnessTitle:         e.witness_title ?? '',
      witnessSignature:     e.witness_signature ?? '',
      witnessTel:           e.witness_tel ?? '',
    });
    if (e.referees?.length) {
      const filled = [{ ...DEF_REFEREE }, { ...DEF_REFEREE }, { ...DEF_REFEREE }];
      (e.referees as any[]).forEach((r, i) => {
        if (i < 3) filled[i] = { name: r.name ?? '', title: r.title ?? '', phone: r.phone ?? '', email: r.email ?? '', address: r.address ?? '' };
      });
      setReferees(filled);
    }
    if (e.emergencyContacts?.length) {
      const k = e.emergencyContacts[0];
      setNextOfKin({ name: k.full_name ?? '', relation: k.relationship ?? '', address: k.address ?? '', phone: k.phone ?? '' });
    }
  }, [existing]);

  /* ── Populate empForm from existing employment ───── */
  useEffect(() => {
    if (!isEdit || !existingEmployments.length) return;
    const emp = existingEmployments[0];
    setEmpForm({
      campusId:       emp.campus_id      ?? '',
      departmentId:   emp.department_id  ?? '',
      jobTitle:       emp.job_title      ?? '',
      payGrade:       emp.pay_grade      ?? '',
      contractType:   emp.contract_type  ?? 'permanent',
      startDate:      emp.start_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      salaryAmount:   '',
      salaryCurrency: 'UGX',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingEmployments]);

  /* ── Derived persisted lists ─────────────────────── */
  const existingEdus = isEdit ? ((existing as any)?.education ?? []) as {
    id:string; institution:string; qualification:string; field_of_study:string;
    year_from:number; year_to:number; grade?:string; honours?:string
  }[] : [];
  const existingWork = isEdit ? ((existing as any)?.workHistory ?? []) as {
    id:string; period_from:string; period_to:string; organisation:string; title:string; supervisor_name?:string;
  }[] : [];
  const existingRefs = isEdit ? ((existing as any)?.referees ?? []) as {
    id:string; ref_order:number; name:string; title?:string; phone?:string; email?:string; address?:string;
  }[] : [];

  /* ── Inline save mutations (edit mode) ───────────── */
  const deleteEdu = useMutation({
    mutationFn:(eduId:string) => window.sakAPI.employees.deleteEducation(id!, eduId),
    onSuccess:() => qc.invalidateQueries({ queryKey:['employee', id] }),
  });
  const saveEduEdit = async () => {
    setEduErr('');
    if (!eduDraft.institution || !eduDraft.qualification || !eduDraft.fieldOfStudy) {
      setEduErr('Institution, qualification and field are required'); return;
    }
    try {
      if (eduEditId) {
        await window.sakAPI.employees.updateEducation(id!, eduEditId, { ...eduDraft });
        setEduEditId(null);
      } else {
        await window.sakAPI.employees.addEducation(id!, { ...eduDraft });
      }
      qc.invalidateQueries({ queryKey:['employee', id] });
      setEduDraft(DEF_EDU_DRAFT);
    } catch(e:any) { setEduErr(e?.response?.data?.message ?? 'Failed'); }
  };

  const deleteWork = useMutation({
    mutationFn:(whId:string) => window.sakAPI.employees.deleteWorkHistory(id!, whId),
    onSuccess:() => qc.invalidateQueries({ queryKey:['employee', id] }),
  });
  const saveWorkEdit = async () => {
    setWorkErr('');
    if (!workDraft.periodFrom || !workDraft.periodTo || !workDraft.organisation || !workDraft.title) {
      setWorkErr('All fields except supervisor are required'); return;
    }
    try {
      if (workEditId) {
        await window.sakAPI.employees.updateWorkHistory(id!, workEditId, workDraft);
        setWorkEditId(null);
      } else {
        await window.sakAPI.employees.addWorkHistory(id!, workDraft);
      }
      qc.invalidateQueries({ queryKey:['employee', id] });
      setWorkDraft(DEF_WORK_DRAFT);
    } catch(e:any) { setWorkErr(e?.response?.data?.message ?? 'Failed'); }
  };

  const saveReferees = async () => {
    setRefErr('');
    try {
      for (let i = 0; i < 3; i++) {
        const r = referees[i];
        if (!r.name.trim()) continue;
        const ex = existingRefs.find(er => er.ref_order === i+1);
        if (ex) {
          await window.sakAPI.employees.updateReferee(id!, ex.id, { ...r });
        } else {
          await window.sakAPI.employees.addReferee(id!, { ...r, refOrder: i+1 });
        }
      }
      qc.invalidateQueries({ queryKey:['employee', id] });
      setRefErr('Saved!');
      setTimeout(() => setRefErr(''), 2000);
    } catch(e:any) { setRefErr(e?.response?.data?.message ?? 'Failed'); }
  };

  /* ── Main save ───────────────────────────────────── */
  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        firstName: personal.firstName,
        middleName: personal.middleName || undefined,
        lastName: personal.lastName,
        gender: personal.gender,
        dateOfBirth: personal.dateOfBirth,
        nationality: personal.nationality,
        nationalId: personal.nationalId || undefined,
        passportNo: personal.passportNo || undefined,
        maritalStatus: personal.maritalStatus as any || undefined,
        bloodGroup: personal.bloodGroup || undefined,
        religion: personal.religion || undefined,
        tribe: personal.tribe || undefined,
        phone: personal.phone,
        phone2: personal.phone2 || undefined,
        whatsappPhone: personal.whatsappPhone || undefined,
        email: personal.email || undefined,
        residentialAddress: personal.residentialAddress || undefined,
        dateAppointed: personal.dateAppointed || undefined,
        typeOfWork: personal.typeOfWork || undefined,
        spouseName: personal.spouseName || undefined,
        spousePhone: personal.spousePhone || undefined,
        noOfChildren: personal.noOfChildren ? Number(personal.noOfChildren) : undefined,
        currentZone: residence.currentZone || undefined,
        landlordName: residence.landlordName || undefined,
        parentsNames: [residence.fatherName && `Father: ${residence.fatherName}`, residence.motherName && `Mother: ${residence.motherName}`].filter(Boolean).join('  ') || undefined,
        village: residence.village || undefined,
        villageZone: residence.villageZone || undefined,
        villageDirection: residence.villageDirection || undefined,
        otherJobInterests: extended.otherJobInterests || undefined,
        earlierResponsibilities: extended.earlierResponsibilities || undefined,
        specialCourses: extended.specialCourses || undefined,
        otherSkills: extended.otherSkills || undefined,
        subjectsOfPreference: extended.subjectsOfPreference || undefined,
        medicalBackground: extended.medicalBackground || undefined,
        otherInformation: extended.otherInformation || undefined,
        tin: personal.tin || undefined,
        nssfNumber: personal.nssfNumber || undefined,
        declarationName: decl.declarationName || undefined,
        declarationTitle: decl.declarationTitle || undefined,
        declarationSignature: decl.declarationSignature || undefined,
        declarationDate: decl.declarationDate || undefined,
        witnessName: decl.witnessName || undefined,
        witnessTitle: decl.witnessTitle || undefined,
        witnessSignature: decl.witnessSignature || undefined,
        witnessTel: decl.witnessTel || undefined,
      };

      if (isEdit) {
        await window.sakAPI.employees.update(id!, payload);
        // Upsert employment record
        if (empForm.campusId && empForm.departmentId && empForm.jobTitle) {
          const empRecords = existingEmployments as any[];
          const empPayload = {
            campusId: empForm.campusId,
            departmentId: empForm.departmentId,
            jobTitle: empForm.jobTitle,
            payGrade: empForm.payGrade || undefined,
            contractType: empForm.contractType,
            startDate: empForm.startDate || new Date().toISOString().slice(0, 10),
          };
          if (empRecords.length) {
            await window.sakAPI.employment.update(empRecords[0].id, empPayload);
          } else {
            await window.sakAPI.employment.create({ employeeId: id!, ...empPayload });
          }
          qc.invalidateQueries({ queryKey: ['employment', id] });
        }
        // Upsert next of kin / emergency contact
        if (nextOfKin.name.trim()) {
          const existingContacts = ((existing as any)?.emergencyContacts ?? []) as any[];
          const kinPayload = {
            fullName: nextOfKin.name, relationship: nextOfKin.relation,
            phone: nextOfKin.phone, address: nextOfKin.address,
          };
          if (existingContacts.length) {
            await window.sakAPI.employees.updateEmergency(id!, existingContacts[0].id, kinPayload);
          } else {
            await window.sakAPI.employees.addEmergency(id!, kinPayload);
          }
        }
        qc.invalidateQueries({ queryKey: ['employee', id] });
        return { id };
      }

      const emp = await window.sakAPI.employees.create(payload) as any;
      const empId = emp?.id ?? emp?.data?.id;
      if (!empId) throw new Error('Employee creation returned no ID');

      if (empForm.campusId && empForm.departmentId && empForm.jobTitle) {
        await window.sakAPI.employment.create({
          employeeId: empId, campusId: empForm.campusId,
          departmentId: empForm.departmentId, jobTitle: empForm.jobTitle,
          payGrade: empForm.payGrade || undefined,
          contractType: empForm.contractType,
          startDate: empForm.startDate || new Date().toISOString().slice(0, 10),
        });
        if (empForm.salaryAmount) {
          const empRecords = await window.sakAPI.employment.getByEmployee(empId) as any[];
          if (empRecords[0]?.id) {
            await window.sakAPI.employment.addSalary(empRecords[0].id, {
              amount: Number(empForm.salaryAmount), currency: empForm.salaryCurrency,
              paymentFrequency: 'monthly', effectiveDate: empForm.startDate,
            });
          }
        }
      }
      for (const edu of eduEntries) await window.sakAPI.employees.addEducation(empId, edu);
      for (const w of workEntries)   await window.sakAPI.employees.addWorkHistory(empId, w);
      for (let i = 0; i < 3; i++) {
        if (referees[i].name.trim()) {
          await window.sakAPI.employees.addReferee(empId, { ...referees[i], refOrder: i+1 });
        }
      }
      if (nextOfKin.name.trim()) {
        await window.sakAPI.employees.addEmergency(empId, {
          fullName: nextOfKin.name, relationship: nextOfKin.relation,
          phone: nextOfKin.phone, address: nextOfKin.address,
        });
      }
      return { id: empId };
    },
    onSuccess:(result:any) => navigate(result?.id ? `/employees/${result.id}` : '/employees'),
    onError:(e:any) => {
      const res = e?.response?.data;
      if (res?.errors?.length) {
        const fields = (res.errors as {field:string; message:string}[])
          .map(f => `${f.field}: ${f.message}`).join(' | ');
        setError(`Validation: ${fields}`);
      } else {
        setError(res?.message ?? e?.message ?? 'Save failed');
      }
    },
  });

  if (isEdit && loadingExisting) return <div className="p-6 text-slate-500">Loading…</div>;

  /* ── Helpers ──────────────────────────────────────── */
  const setPers  = (k: keyof typeof personal) => (e: ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => setPersonal(p => ({ ...p, [k]: e.target.value }));
  const setRes   = (k: keyof typeof residence) => (e: ChangeEvent<HTMLInputElement|HTMLTextAreaElement>) => setResidence(p => ({ ...p, [k]: e.target.value }));
  const setExt   = (k: keyof typeof extended) => (e: ChangeEvent<HTMLTextAreaElement|HTMLInputElement>) => setExtended(p => ({ ...p, [k]: e.target.value }));
  const setDeclF = (k: keyof typeof decl) => (e: ChangeEvent<HTMLInputElement>) => setDecl(p => ({ ...p, [k]: e.target.value }));
  const setEF    = (k: keyof typeof empForm) => (e: ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setEmpForm(p => ({ ...p, [k]: e.target.value }));

  const TABS: { key: TabKey; label: string; icon: React.ElementType; hide?: boolean }[] = [
    { key:'biodata',     label:'Biodata',      icon: User },
    { key:'academic',    label:'Academic',     icon: GraduationCap },
    { key:'work',        label:'Work History', icon: Briefcase },
    { key:'nextOfKin',   label:'Next of Kin',  icon: Heart },
    { key:'residence',   label:'Residence',    icon: MapPin },
    { key:'referees',    label:'Referees',     icon: Users },
    { key:'other',       label:'Other',        icon: ClipboardList },
    { key:'payroll',     label:'Payroll / IDs', icon: CreditCard },
    { key:'medical',     label:'Medical',      icon: Activity },
    { key:'employment',  label:'Employment',   icon: Building2 },
    { key:'declaration', label:'Declaration',  icon: PenLine },
  ];

  const visibleTabs = TABS.filter(t => !t.hide);
  const currentTabIdx = visibleTabs.findIndex(t => t.key === tab);
  const isFirstTab = currentTabIdx === 0;
  const isLastTab  = currentTabIdx === visibleTabs.length - 1;
  const goNext = () => { if (!isLastTab) setTab(visibleTabs[currentTabIdx + 1].key); };
  const goPrev = () => { if (!isFirstTab) setTab(visibleTabs[currentTabIdx - 1].key); };

  function printBlankForm() {
    const el = document.getElementById('sak-paper-form');
    if (!el) return;
    const css = `
      *, *::before, *::after { box-sizing: border-box; }
      body { margin: 0; padding: 0; background: white; color: #000; }
      @page { margin: 20mm 18mm; }
      .pf-page   { font-family: Arial, sans-serif; color: #000; }
      .pf-title  { text-align: center; margin-bottom: 4mm; }
      .pf-title h1 { font-size: 15pt; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin: 0; }
      .pf-title h2 { font-size: 12pt; font-weight: 700; margin: 2mm 0 0; }
      .pf-title p  { font-size: 9pt; margin: 2mm 0 0; color: #333; }
      .pf-divider { border: none; border-top: 2.5px solid #000; margin: 4mm 0; }
      .pf-section { margin-bottom: 6mm; }
      .pf-section-title { background: #000; color: #fff; font-size: 9.5pt; font-weight: 800; text-transform: uppercase; padding: 2mm 3mm; margin-bottom: 4mm; letter-spacing: 0.8px; page-break-after: avoid; }
      .pf-row    { display: flex; gap: 6mm; margin-bottom: 5mm; align-items: flex-end; }
      .pf-field  { flex: 1; }
      .pf-label  { font-size: 8pt; font-weight: 700; display: block; margin-bottom: 1.5mm; text-transform: uppercase; letter-spacing: 0.3px; }
      .pf-line   { display: block; width: 100%; height: 7mm;
                   border-bottom: 1.5px dashed #555;
                   background: none; }
      .pf-check-row { display: flex; gap: 6mm; flex-wrap: wrap; margin-bottom: 5mm; align-items: center; }
      .pf-check-row .pf-label { margin-bottom: 0; margin-right: 2mm; }
      .pf-checkbox { display: inline-flex; align-items: center; gap: 2mm; font-size: 10pt; font-weight: 600; }
      .pf-box    { width: 5mm; height: 5mm; border: 1.5px solid #000; display: inline-block; flex-shrink: 0; background: white; vertical-align: middle; }
      .pf-textarea-lines { width: 100%; }
      .pf-textarea-lines .pf-line { margin-bottom: 3mm; }
      table.pf-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 4mm; }
      table.pf-table th { background: #ddd; border: 1px solid #666; padding: 2mm; font-weight: 800; text-align: left; }
      table.pf-table td { border: 1px solid #888; height: 9mm; padding: 1mm 2mm; }
      .pf-sig-box { border: 1.5px solid #444; height: 22mm; width: 65mm; display: inline-block; }
      .pf-decl-quote { font-style: italic; font-size: 9.5pt; border-left: 4px solid #000; padding-left: 4mm; margin-bottom: 5mm; line-height: 1.5; }
      .pf-ref-block { margin-bottom: 5mm; padding-left: 3mm; border-left: 2.5px solid #aaa; }
      .pf-ref-num { font-weight: 800; font-size: 9pt; margin-bottom: 2mm; }
    `;
    const win = window.open('', '_blank', 'width=960,height=800');
    if (!win) { alert('Pop-up blocked. Please allow pop-ups for this page.'); return; }
    writePrintDocument(win,
      `<!DOCTYPE html><html><head><meta charset="utf-8">`
      + `<title>SAK Staffing – Biodata Form</title>`
      + `<style>${css}</style></head>`
      + `<body>${el.innerHTML}</body></html>`
    );
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5 w-full max-w-6xl mx-auto">

      {/* ── Paper form hidden on screen ──────────────────────────── */}
      <style>{`#sak-paper-form { display: none; }`}</style>

      {/* ── Paper questionnaire (print only) ─────────────────────── */}
      <div id="sak-paper-form">
        <div className="pf-page">

          {/* Header */}
          <div className="pf-title">
            <h1>Sir Apollo Kaggwa Schools</h1>
            <h2>Staff Biodata Form</h2>
            <p>Please complete all sections clearly in BLOCK LETTERS using a black or blue pen.</p>
          </div>
          <hr className="pf-divider" />

          {/* S1 – Personal Details */}
          <div className="pf-section">
            <div className="pf-section-title">Section 1 &mdash; Personal Details</div>
            <div className="pf-row">
              <div className="pf-field" style={{flex:2}}><span className="pf-label">Surname (Last Name)</span><span className="pf-line"/></div>
              <div className="pf-field" style={{flex:2}}><span className="pf-label">First Name</span><span className="pf-line"/></div>
              <div className="pf-field" style={{flex:2}}><span className="pf-label">Middle Name</span><span className="pf-line"/></div>
            </div>
            <div className="pf-row">
              <div className="pf-field">
                <span className="pf-label">Sex</span>
                <span style={{display:'flex',gap:'8mm',alignItems:'center',marginTop:'1mm'}}>
                  <span className="pf-checkbox"><span className="pf-box"/>&nbsp;Male</span>
                  <span className="pf-checkbox"><span className="pf-box"/>&nbsp;Female</span>
                </span>
              </div>
              <div className="pf-field"><span className="pf-label">Blood Group</span><span className="pf-line"/></div>
            </div>
            <div className="pf-row">
              <div className="pf-field">
                <span className="pf-label">Marital Status</span>
                <span style={{display:'flex',gap:'6mm',alignItems:'center',marginTop:'1mm',flexWrap:'wrap'}}>
                  {['Single','Married','Divorced','Widowed'].map(s => <span key={s} className="pf-checkbox"><span className="pf-box"/>&nbsp;{s}</span>)}
                </span>
              </div>
              <div className="pf-field"><span className="pf-label">Nationality</span><span className="pf-line"/></div>
            </div>
            <div className="pf-row">
              <div className="pf-field" style={{flex:2}}><span className="pf-label">Tribe</span><span className="pf-line"/></div>
              <div className="pf-field" style={{flex:2}}><span className="pf-label">Religion</span><span className="pf-line"/></div>
              <div className="pf-field" style={{flex:1}}><span className="pf-label">National ID No.</span><span className="pf-line"/></div>
            </div>
            <div className="pf-row">
              <div className="pf-field"><span className="pf-label">Spouse&apos;s Name (if married)</span><span className="pf-line"/></div>
              <div className="pf-field"><span className="pf-label">No. of Children</span><span className="pf-line"/></div>
              <div className="pf-field"><span className="pf-label">Passport No.</span><span className="pf-line"/></div>
            </div>
          </div>

          {/* S2 – Contact */}
          <div className="pf-section">
            <div className="pf-section-title">Section 2 &mdash; Contact Details</div>
            <div className="pf-row">
              <div className="pf-field"><span className="pf-label">Personal Tel. 1</span><span className="pf-line"/></div>
              <div className="pf-field"><span className="pf-label">Personal Tel. 2</span><span className="pf-line"/></div>
              <div className="pf-field"><span className="pf-label">WhatsApp No.</span><span className="pf-line"/></div>
            </div>
            <div className="pf-row">
              <div className="pf-field"><span className="pf-label">Email Address</span><span className="pf-line"/></div>
            </div>
            <div className="pf-row">
              <div className="pf-field"><span className="pf-label">Residential Address</span><span className="pf-line"/></div>
            </div>
          </div>

          {/* S3 – Appointment */}
          <div className="pf-section">
            <div className="pf-section-title">Section 3 &mdash; Appointment</div>
            <div className="pf-row">
              <div className="pf-field"><span className="pf-label">Date Appointed</span><span className="pf-line"/></div>
              <div className="pf-field"><span className="pf-label">Institution / Station</span><span className="pf-line"/></div>
              <div className="pf-field"><span className="pf-label">Designation / Job Title</span><span className="pf-line"/></div>
            </div>
            <div className="pf-row">
              <div className="pf-field"><span className="pf-label">Type of Work Applied For</span><span className="pf-line"/></div>
              <div className="pf-field"><span className="pf-label">Department</span><span className="pf-line"/></div>
            </div>
          </div>

          {/* S4 – Academic */}
          <div className="pf-section">
            <div className="pf-section-title">Section 4 &mdash; Academic / Personal Training</div>
            <p style={{fontSize:'8pt',marginBottom:'2mm',color:'#444'}}>Period, School/Institution, Qualifications attained, any special honours</p>
            <table className="pf-table">
              <thead>
                <tr>
                  <th style={{width:'13%'}}>Period From</th><th style={{width:'13%'}}>Period To</th><th style={{width:'28%'}}>School / Institution / University</th>
                  <th style={{width:'24%'}}>Qualification Attained</th><th style={{width:'10%'}}>Grade</th><th style={{width:'12%'}}>Special Honours</th>
                </tr>
              </thead>
              <tbody>
                {[0,1,2,3,4,5,6].map(i => <tr key={i}><td/><td/><td/><td/><td/><td/></tr>)}
              </tbody>
            </table>
          </div>

          {/* S5 – Work History */}
          <div className="pf-section">
            <div className="pf-section-title">Section 5 &mdash; Previous Employment History</div>
            <p style={{fontSize:'8pt',marginBottom:'2mm',color:'#444'}}>Starting with latest employment. Leave blank if not applicable.</p>
            <table className="pf-table">
              <thead>
                <tr>
                  <th style={{width:'13%'}}>Period From</th><th style={{width:'13%'}}>Period To</th><th style={{width:'30%'}}>Organisation / Institution</th>
                  <th style={{width:'22%'}}>Title / Position</th><th style={{width:'22%'}}>Immediate Supervisor</th>
                </tr>
              </thead>
              <tbody>
                {[0,1,2,3,4,5,6].map(i => <tr key={i}><td/><td/><td/><td/><td/></tr>)}
              </tbody>
            </table>
          </div>

          {/* S6 – Next of Kin */}
          <div className="pf-section">
            <div className="pf-section-title">Section 6 &mdash; Next of Kin</div>
            <div className="pf-row">
              <div className="pf-field" style={{flex:3}}><span className="pf-label">Full Name of Next of Kin</span><span className="pf-line"/></div>
              <div className="pf-field" style={{flex:2}}><span className="pf-label">Type of Relation</span><span className="pf-line"/></div>
            </div>
            <div className="pf-row">
              <div className="pf-field"><span className="pf-label">Phone</span><span className="pf-line"/></div>
              <div className="pf-field" style={{flex:2}}><span className="pf-label">Address</span><span className="pf-line"/></div>
            </div>
          </div>

          {/* S7 – Residence */}
          <div className="pf-section">
            <div className="pf-section-title">Section 7 &mdash; Residence &amp; Village Details</div>
            <div className="pf-row">
              <div className="pf-field" style={{flex:3}}><span className="pf-label">Current Residential Address</span><span className="pf-line"/></div>
              <div className="pf-field" style={{flex:1}}><span className="pf-label">Zone</span><span className="pf-line"/></div>
              <div className="pf-field" style={{flex:2}}><span className="pf-label">Landlord Name</span><span className="pf-line"/></div>
            </div>
            <div className="pf-row">
              <div className="pf-field" style={{flex:2}}><span className="pf-label">Village</span><span className="pf-line"/></div>
              <div className="pf-field" style={{flex:1}}><span className="pf-label">Village Zone</span><span className="pf-line"/></div>
            </div>
            <div className="pf-row">
              <div className="pf-field"><span className="pf-label">Physical Direction to Village</span>
                <div className="pf-textarea-lines">{[0,1].map(i=><span key={i} className="pf-line" style={{display:'block',marginBottom:'2mm'}}/>)}</div>
              </div>
            </div>
            <div className="pf-row">
              <div className="pf-field"><span className="pf-label">Names of Parents</span><span className="pf-line"/></div>
            </div>
          </div>

          {/* S8 – Referees */}
          <div className="pf-section">
            <div className="pf-section-title">Section 8 &mdash; Referees</div>
            <p style={{fontSize:'8pt',marginBottom:'3mm',color:'#444'}}>Provide THREE referees who know you well (not relatives)</p>
            {[1,2,3].map(n => (
              <div key={n} className="pf-ref-block">
                <div className="pf-ref-num">Referee {n}</div>
                <div className="pf-row">
                  <div className="pf-field" style={{flex:3}}><span className="pf-label">Full Name</span><span className="pf-line"/></div>
                  <div className="pf-field" style={{flex:2}}><span className="pf-label">Title / Position</span><span className="pf-line"/></div>
                </div>
                <div className="pf-row">
                  <div className="pf-field"><span className="pf-label">Phone</span><span className="pf-line"/></div>
                  <div className="pf-field"><span className="pf-label">Email</span><span className="pf-line"/></div>
                  <div className="pf-field" style={{flex:2}}><span className="pf-label">Address</span><span className="pf-line"/></div>
                </div>
              </div>
            ))}
          </div>

          {/* S9 – Other */}
          <div className="pf-section">
            <div className="pf-section-title">Section 9 &mdash; Other Information</div>
            <div style={{marginBottom:'4mm'}}>
              <span className="pf-label">Other Areas of Job Interest (other than applied for)</span>
              <div className="pf-textarea-lines">{[0,1,2].map(i=><span key={i} className="pf-line" style={{display:'block',marginBottom:'3mm'}}/>)}</div>
            </div>
            <div style={{marginBottom:'4mm'}}>
              <span className="pf-label">Earlier Responsibilities</span>
              <div className="pf-textarea-lines">{[0,1,2].map(i=><span key={i} className="pf-line" style={{display:'block',marginBottom:'3mm'}}/>)}</div>
            </div>
            <div style={{marginBottom:'4mm'}}>
              <span className="pf-label">Special Courses / Workshops / Seminars Attended</span>
              <div className="pf-textarea-lines">{[0,1,2,3].map(i=><span key={i} className="pf-line" style={{display:'block',marginBottom:'3mm'}}/>)}</div>
            </div>
            <div style={{marginBottom:'4mm'}}>
              <span className="pf-label">Any Other Information for Employer</span>
              <div className="pf-textarea-lines">{[0,1,2].map(i=><span key={i} className="pf-line" style={{display:'block',marginBottom:'3mm'}}/>)}</div>
            </div>
          </div>

          {/* S10 – Medical */}
          <div className="pf-section">
            <div className="pf-section-title">Section 10 &mdash; Medical Background</div>
            <p style={{fontSize:'8pt',marginBottom:'2mm',color:'#444'}}>Write any type of illness you normally suffer from, emergency treatment, and details of doctor/clinic where you are normally treated.</p>
            <div className="pf-textarea-lines">{[0,1,2,3,4].map(i=><span key={i} className="pf-line" style={{display:'block',marginBottom:'3mm'}}/>)}</div>
          </div>

          {/* S11 – Declaration */}
          <div className="pf-section">
            <div className="pf-section-title">Section 11 &mdash; Declaration</div>
            <div className="pf-decl-quote">
              &ldquo;I certify that the information given on this form is true and complete, and pledge to update it as soon as there is any change.&rdquo;
            </div>
            <div className="pf-row">
              <div className="pf-field" style={{flex:2}}><span className="pf-label">Name</span><span className="pf-line"/></div>
              <div className="pf-field" style={{flex:2}}><span className="pf-label">Title</span><span className="pf-line"/></div>
              <div className="pf-field" style={{flex:1}}><span className="pf-label">Date</span><span className="pf-line"/></div>
            </div>
            <div className="pf-row">
              <div className="pf-field">
                <span className="pf-label">Signature</span>
                <span className="pf-sig-box" style={{display:'block',marginTop:'1mm'}}/>
              </div>
              <div className="pf-field"/>
            </div>
            <div style={{fontWeight:700, fontSize:'9pt', marginTop:'4mm', marginBottom:'2mm'}}>Witnessed By</div>
            <div className="pf-row">
              <div className="pf-field" style={{flex:2}}><span className="pf-label">Name</span><span className="pf-line"/></div>
              <div className="pf-field" style={{flex:2}}><span className="pf-label">Title</span><span className="pf-line"/></div>
              <div className="pf-field" style={{flex:1}}><span className="pf-label">Tel No.</span><span className="pf-line"/></div>
            </div>
            <div className="pf-row">
              <div className="pf-field">
                <span className="pf-label">Signature</span>
                <span className="pf-sig-box" style={{display:'block',marginTop:'1mm'}}/>
              </div>
              <div className="pf-field"/>
            </div>
          </div>

          <hr className="pf-divider" />
          <p style={{fontSize:'7.5pt',textAlign:'center',color:'#666',marginTop:'3mm'}}>Sir Apollo Kaggwa Schools &mdash; Confidential Staff Record &mdash; Do not circulate</p>
        </div>
      </div>

      {/* ── Digital form (screen only) ────────────────────────────── */}
      <div id="sak-digital-form">

      {/* Screen header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <UserPlus size={20} /> {isEdit ? 'Edit Staff Profile' : 'Add New Staff'}
          </h1>
          <p className="text-slate-400 text-sm">{isEdit ? 'Update staff biodata' : 'Register a new employee — Staff Biodata'}</p>
        </div>
        <button type="button" onClick={printBlankForm} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" title="Print blank paper form for handwriting">
          <Printer size={13} /> Print Blank Form
        </button>
      </div>

      {/* Tabs */}
      <div className="no-print flex flex-wrap gap-0.5 border-b border-slate-200 dark:border-slate-800">
        {TABS.filter(t => !t.hide).map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}>
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-end text-xs text-slate-400 dark:text-slate-500 -mt-1">
        Step {currentTabIdx + 1} of {visibleTabs.length}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); setError(''); save.mutate(); }}>

        {/* ══════════════════════ BIODATA ══════════════════════ */}
        {tab === 'biodata' && (
          <div className="card space-y-4">
            <SectionHdr><span className="flex items-center gap-1.5"><User size={13}/> Personal Details</span></SectionHdr>
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
                <label className="label">Sex / Gender *</label>
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
                <label className="label">Tribe</label>
                <select className="input" value={personal.tribe} onChange={setPers('tribe')}>
                  <option value="">— Select Tribe —</option>
                  {UGANDA_TRIBES.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="label">Religion</label>
                <select className="input" value={personal.religion} onChange={setPers('religion')}>
                  <option value="">— Select —</option>
                  {['Catholic','Anglican','Muslim','Seventh Day Adventist','Pentecostal','Orthodox','Born Again','Adventist','Other'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Nationality</label>
                <select className="input"
                  value={EA_NATIONALITIES.includes(personal.nationality) ? personal.nationality : '__other__'}
                  onChange={e => setPersonal(p => ({ ...p, nationality: e.target.value === '__other__' ? '' : e.target.value }))}>
                  {EA_NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                  <option value="__other__">Other…</option>
                </select>
                {!EA_NATIONALITIES.includes(personal.nationality) && (
                  <input className="input mt-1" placeholder="Specify nationality" value={personal.nationality} onChange={setPers('nationality')} />
                )}
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

            {personal.maritalStatus === 'married' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Name of Spouse</label>
                    <input className="input" value={personal.spouseName} onChange={setPers('spouseName')} />
                  </div>
                  <div>
                    <label className="label">Spouse Phone Number</label>
                    <input className="input" type="tel" placeholder="+256 7XX XXX XXX" value={personal.spousePhone} onChange={setPers('spousePhone')} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">No. of Children</label>
                    <input className="input" type="number" min="0" max="30" value={personal.noOfChildren} onChange={setPers('noOfChildren')} />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">National ID</label>
                <input className="input" value={personal.nationalId} onChange={setPers('nationalId')} />
              </div>
              <div>
                <label className="label">Blood Group</label>
                <select className="input" value={personal.bloodGroup} onChange={setPers('bloodGroup')}>
                  <option value="">— Select —</option>
                  {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                </select>
              </div>
            </div>

            <SectionHdr>Contact Details</SectionHdr>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Personal Tel. 1 *</label>
                <input className="input" required value={personal.phone} onChange={setPers('phone')} placeholder="+256 7XX XXX XXX" />
              </div>
              <div>
                <label className="label">Personal Tel. 2</label>
                <input className="input" value={personal.phone2} onChange={setPers('phone2')} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">WhatsApp Contact Number</label>
                <input className="input" value={personal.whatsappPhone} onChange={setPers('whatsappPhone')} placeholder="+256 7XX XXX XXX" />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={personal.email} onChange={setPers('email')} />
              </div>
            </div>

            <SectionHdr>Appointment</SectionHdr>
            <div>
              <label className="label">Station / School *</label>
              <select
                className="input"
                required
                value={empForm.campusId}
                onChange={e => setEmpForm(p => ({ ...p, campusId: e.target.value, departmentId: '' }))}
              >
                <option value="">— Select Station / School —</option>
                {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Date Appointed</label>
                <input className="input" type="date" value={personal.dateAppointed} onChange={setPers('dateAppointed')} />
              </div>
              <div>
                <label className="label">Type of Work Applied For</label>
                <input className="input" value={personal.typeOfWork} onChange={setPers('typeOfWork')} placeholder="e.g. Teaching, Administration" />
              </div>
            </div>
            {personal.dateAppointed && (() => {
              const ms = Date.now() - new Date(personal.dateAppointed).getTime();
              const totalMonths = Math.floor(ms / (1000 * 60 * 60 * 24 * 30.44));
              const years  = Math.floor(totalMonths / 12);
              const months = totalMonths % 12;
              const label  = [years  > 0 && `${years} yr${years  !== 1 ? 's' : ''}`,
                              months > 0 && `${months} mo${months !== 1 ? 's' : ''}`].filter(Boolean).join(' ');
              return label ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 text-sm">
                  <span className="font-semibold">Years of Service:</span>
                  <span>{label}</span>
                </div>
              ) : null;
            })()}
          </div>
        )}

        {/* ══════════════════════ ACADEMIC ══════════════════════ */}
        {tab === 'academic' && (
          <div className="space-y-4">
            {isEdit && existingEdus.length > 0 && (
              <div className="card space-y-3">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <GraduationCap size={15}/> Saved Qualifications
                </h3>
                {existingEdus.map(e => (
                  <div key={e.id} className={`flex items-start justify-between gap-3 border rounded-lg px-3 py-2.5 transition-colors ${
                    eduEditId === e.id
                      ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{e.qualification}</p>
                      <p className="text-xs text-slate-500">{e.institution} &middot; {e.field_of_study}</p>
                      <p className="text-xs text-slate-400">{e.year_from} – {e.year_to}{e.grade ? ` · ${e.grade}` : ''}</p>
                      {e.honours && <p className="text-xs text-amber-600">🏅 {e.honours}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button"
                        onClick={() => {
                          setEduEditId(e.id);
                          setEduDraft({
                            institution:  e.institution,
                            qualification: e.qualification,
                            fieldOfStudy:  e.field_of_study,
                            yearFrom:      e.year_from.toString(),
                            yearTo:        e.year_to.toString(),
                            grade:         e.grade ?? '',
                            honours:       e.honours ?? '',
                          });
                          setEduErr('');
                        }}
                        className="p-1.5 text-slate-400 hover:text-brand-500 transition-colors" title="Edit">
                        <Pencil size={13}/>
                      </button>
                      <button type="button"
                        onClick={() => { if (confirm('Remove this qualification?')) deleteEdu.mutate(e.id); }}
                        className="p-1.5 text-slate-400 hover:text-red-400 transition-colors" title="Delete">
                        <Trash2 size={13}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!isEdit && eduEntries.length > 0 && (
              <div className="card space-y-3">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <GraduationCap size={15}/> To Add
                </h3>
                {eduEntries.map((e, i) => (
                  <div key={i} className={`flex items-start justify-between gap-3 border rounded-lg px-3 py-2.5 transition-colors ${
                    eduPendingIdx === i ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20' : 'border-slate-200 dark:border-slate-700'
                  }`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{e.qualification} — {e.institution}</p>
                      <p className="text-xs text-slate-400">{e.yearFrom}–{e.yearTo} &middot; {e.fieldOfStudy}{e.grade ? ` · ${e.grade}` : ''}</p>
                      {e.honours && <p className="text-xs text-amber-600">🏅 {e.honours}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button"
                        onClick={() => { setEduPendingIdx(i); setEduDraft({ ...e }); setEduErr(''); }}
                        className="p-1.5 text-slate-400 hover:text-brand-500 transition-colors" title="Edit">
                        <Pencil size={13}/>
                      </button>
                      <button type="button"
                        onClick={() => { setEduEntries(arr => arr.filter((_,j) => j !== i)); if (eduPendingIdx === i) { setEduPendingIdx(null); setEduDraft(DEF_EDU_DRAFT); } }}
                        className="p-1.5 text-slate-400 hover:text-red-400 shrink-0"><Trash2 size={13}/></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="card space-y-4">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                {(eduEditId || eduPendingIdx !== null) ? <Pencil size={14}/> : <Plus size={14}/>}
                {(eduEditId || eduPendingIdx !== null) ? 'Edit Qualification' : 'Add Academic / Training Record'}
              </h3>
              <p className="text-xs text-slate-400">Period, School/Institution, Qualifications attained, any special honours.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">School / Institution / University *</label>
                  <input className="input" placeholder="e.g. Makerere University" value={eduDraft.institution}
                    onChange={e => setEduDraft(d => ({ ...d, institution: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Qualification / Award *</label>
                  <input className="input" placeholder="e.g. Bachelor of Education" value={eduDraft.qualification}
                    onChange={e => setEduDraft(d => ({ ...d, qualification: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Level of Education *</label>
                  <select className="input" value={eduDraft.fieldOfStudy}
                    onChange={e => setEduDraft(d => ({ ...d, fieldOfStudy: e.target.value }))}>
                    <option value="">— Select Level —</option>
                    {['Pre-Primary','Primary','O-Level (UCE)','A-Level (UACE)','Grade 2 (PTC)','Grade 3 (PTC)','Certificate','Diploma','Degree / Bachelor','Masters','PhD / Doctorate','Professional Course','Other'].map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Period From *</label>
                  <input className="input" type="number" min="1950" max="2099" value={eduDraft.yearFrom}
                    onChange={e => setEduDraft(d => ({ ...d, yearFrom: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Period To *</label>
                  <input className="input" type="number" min="1950" max="2099" value={eduDraft.yearTo}
                    onChange={e => setEduDraft(d => ({ ...d, yearTo: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Grade / Award Class</label>
                  <input className="input" placeholder="e.g. Second Class Upper" value={eduDraft.grade}
                    onChange={e => setEduDraft(d => ({ ...d, grade: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Any Special Honours</label>
                  <input className="input" placeholder="e.g. Best Student Award" value={eduDraft.honours}
                    onChange={e => setEduDraft(d => ({ ...d, honours: e.target.value }))} />
                </div>
              </div>
              {eduErr && <p className="text-red-400 text-sm">{eduErr}</p>}
              <div className="flex items-center justify-between gap-3">
                {(eduEditId || eduPendingIdx !== null) ? (
                  <button type="button" className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    onClick={() => { setEduEditId(null); setEduPendingIdx(null); setEduDraft(DEF_EDU_DRAFT); setEduErr(''); }}>
                    <X size={13}/> Cancel
                  </button>
                ) : <span />}
                {isEdit
                  ? <button type="button" className="btn-primary text-xs" onClick={saveEduEdit}>
                      {eduEditId ? <><Pencil size={13}/> Update Qualification</> : <><Plus size={13}/> Save Qualification</>}
                    </button>
                  : <button type="button" className="btn-secondary text-xs" onClick={() => {
                      setEduErr('');
                      if (!eduDraft.institution || !eduDraft.qualification || !eduDraft.fieldOfStudy) { setEduErr('Institution, qualification and level required'); return; }
                      if (eduPendingIdx !== null) {
                        setEduEntries(arr => arr.map((x, i) => i === eduPendingIdx ? { ...eduDraft } : x));
                        setEduPendingIdx(null);
                      } else {
                        setEduEntries(arr => [...arr, { ...eduDraft }]);
                      }
                      setEduDraft(DEF_EDU_DRAFT);
                    }}>
                      {eduPendingIdx !== null ? <><Pencil size={13}/> Update</> : <><Plus size={13}/> Add to List</>}
                    </button>
                }
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════ WORK HISTORY ══════════════════════ */}
        {tab === 'work' && (
          <div className="space-y-4">
            {isEdit && existingWork.length > 0 && (
              <div className="card space-y-3">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <Briefcase size={15}/> Employment History
                </h3>
                {existingWork.map(w => (
                  <div key={w.id} className={`flex items-start justify-between gap-3 border rounded-lg px-3 py-2.5 transition-colors ${
                    workEditId === w.id ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20' : 'border-slate-200 dark:border-slate-700'
                  }`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{w.title} — {w.organisation}</p>
                      <p className="text-xs text-slate-400">{w.period_from} – {w.period_to}</p>
                      {w.supervisor_name && <p className="text-xs text-slate-400">Supervisor: {w.supervisor_name}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button"
                        onClick={() => { setWorkEditId(w.id); setWorkDraft({ periodFrom: w.period_from, periodTo: w.period_to, organisation: w.organisation, title: w.title, supervisorName: w.supervisor_name ?? '' }); setWorkErr(''); }}
                        className="p-1.5 text-slate-400 hover:text-brand-500 transition-colors" title="Edit">
                        <Pencil size={13}/>
                      </button>
                      <button type="button" onClick={() => { if (confirm('Remove?')) deleteWork.mutate(w.id); }}
                        className="p-1.5 text-slate-400 hover:text-red-400 shrink-0"><Trash2 size={13}/></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!isEdit && workEntries.length > 0 && (
              <div className="card space-y-3">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <Briefcase size={15}/> To Add
                </h3>
                {workEntries.map((w, i) => (
                  <div key={i} className={`flex items-start justify-between gap-3 border rounded-lg px-3 py-2.5 transition-colors ${
                    workPendingIdx === i ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20' : 'border-slate-200 dark:border-slate-700'
                  }`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{w.title} — {w.organisation}</p>
                      <p className="text-xs text-slate-400">{w.periodFrom} – {w.periodTo}{w.supervisorName ? ` · ${w.supervisorName}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button"
                        onClick={() => { setWorkPendingIdx(i); setWorkDraft({ ...w }); setWorkErr(''); }}
                        className="p-1.5 text-slate-400 hover:text-brand-500 transition-colors" title="Edit">
                        <Pencil size={13}/>
                      </button>
                      <button type="button"
                        onClick={() => { setWorkEntries(arr => arr.filter((_,j) => j !== i)); if (workPendingIdx === i) { setWorkPendingIdx(null); setWorkDraft(DEF_WORK_DRAFT); } }}
                        className="p-1.5 text-slate-400 hover:text-red-400 shrink-0"><Trash2 size={13}/></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="card space-y-4">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                {(workEditId || workPendingIdx !== null) ? <Pencil size={14}/> : <Plus size={14}/>}
                {(workEditId || workPendingIdx !== null) ? 'Edit Employment Record' : 'Add Employment Record'}
              </h3>
              <p className="text-xs text-slate-400">Period, Organisation/Institution, Title, Names of Immediate Supervisor.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Period From *</label>
                  <input className="input" placeholder="e.g. Jan 2018 or 2018" value={workDraft.periodFrom}
                    onChange={e => setWorkDraft(d => ({ ...d, periodFrom: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Period To *</label>
                  <input className="input" placeholder="e.g. Dec 2021 or Present" value={workDraft.periodTo}
                    onChange={e => setWorkDraft(d => ({ ...d, periodTo: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Organisation / Institution *</label>
                  <input className="input" placeholder="e.g. Sir Apollo Kaggwa Schools" value={workDraft.organisation}
                    onChange={e => setWorkDraft(d => ({ ...d, organisation: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Title / Position *</label>
                  <input className="input" placeholder="e.g. Class Teacher" value={workDraft.title}
                    onChange={e => setWorkDraft(d => ({ ...d, title: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Names of Immediate Supervisor</label>
                  <input className="input" value={workDraft.supervisorName}
                    onChange={e => setWorkDraft(d => ({ ...d, supervisorName: e.target.value }))} />
                </div>
              </div>
              {workErr && <p className="text-red-400 text-sm">{workErr}</p>}
              <div className="flex items-center justify-between gap-3">
                {(workEditId || workPendingIdx !== null) ? (
                  <button type="button" className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    onClick={() => { setWorkEditId(null); setWorkPendingIdx(null); setWorkDraft(DEF_WORK_DRAFT); setWorkErr(''); }}>
                    <X size={13}/> Cancel
                  </button>
                ) : <span />}
                {isEdit
                  ? <button type="button" className="btn-primary text-xs" onClick={saveWorkEdit}>
                      {workEditId ? <><Pencil size={13}/> Update Record</> : <><Plus size={13}/> Save Record</>}
                    </button>
                  : <button type="button" className="btn-secondary text-xs" onClick={() => {
                      setWorkErr('');
                      if (!workDraft.periodFrom || !workDraft.periodTo || !workDraft.organisation || !workDraft.title) { setWorkErr('Period, organisation and title are required'); return; }
                      if (workPendingIdx !== null) {
                        setWorkEntries(arr => arr.map((x, i) => i === workPendingIdx ? { ...workDraft } : x));
                        setWorkPendingIdx(null);
                      } else {
                        setWorkEntries(arr => [...arr, { ...workDraft }]);
                      }
                      setWorkDraft(DEF_WORK_DRAFT);
                    }}>
                      {workPendingIdx !== null ? <><Pencil size={13}/> Update</> : <><Plus size={13}/> Add to List</>}
                    </button>
                }
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════ NEXT OF KIN ══════════════════════ */}
        {tab === 'nextOfKin' && (
          <div className="card space-y-4">
            <SectionHdr>Next of Kin</SectionHdr>
            <p className="text-xs text-slate-400">Names of next of kin, type of relation, address, contact number.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Full Name</label>
                <input className="input" value={nextOfKin.name} onChange={e => setNextOfKin(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Type of Relation</label>
                <select className="input" value={nextOfKin.relation} onChange={e => setNextOfKin(p => ({ ...p, relation: e.target.value }))}>
                  <option value="">— Select —</option>
                  {['Spouse','Parent','Child','Sibling','Uncle','Aunt','Cousin','Guardian','Friend','Other'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={nextOfKin.phone} onChange={e => setNextOfKin(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div>
                <label className="label">Address</label>
                <input className="input" value={nextOfKin.address} onChange={e => setNextOfKin(p => ({ ...p, address: e.target.value }))} />
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════ RESIDENCE ══════════════════════ */}
        {tab === 'residence' && (
          <div className="card space-y-4">
            <SectionHdr>Current Residence</SectionHdr>
            <p className="text-xs text-slate-400">Address up to zone and landlord.</p>
            <div>
              <label className="label">Residential Address</label>
              <textarea className="input resize-none" rows={2} value={personal.residentialAddress}
                onChange={e => setPersonal(p => ({ ...p, residentialAddress: e.target.value }))} placeholder="Street, estate, plot number…" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Zone</label>
                <input className="input" placeholder="e.g. Makindye Zone 4" value={residence.currentZone} onChange={setRes('currentZone')} />
              </div>
              <div>
                <label className="label">Landlord Name</label>
                <input className="input" value={residence.landlordName} onChange={setRes('landlordName')} />
              </div>
            </div>

            <SectionHdr>Village Information</SectionHdr>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Village</label>
                <input className="input" value={residence.village} onChange={setRes('village')} />
              </div>
              <div>
                <label className="label">Village Zone</label>
                <input className="input" value={residence.villageZone} onChange={setRes('villageZone')} />
              </div>
            </div>
            <div>
              <label className="label">Physical Direction to Village</label>
              <textarea className="input resize-none" rows={3} value={residence.villageDirection} onChange={setRes('villageDirection')}
                placeholder="e.g. From Kampala take Masaka road, turn left at Lweza trading centre, 2km north…" />
            </div>

            <SectionHdr>Parents / Family</SectionHdr>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Father's Name</label>
                <input className="input" placeholder="Full name of father" value={residence.fatherName} onChange={setRes('fatherName')} />
              </div>
              <div>
                <label className="label">Mother's Name</label>
                <input className="input" placeholder="Full name of mother" value={residence.motherName} onChange={setRes('motherName')} />
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════ REFEREES ══════════════════════ */}
        {tab === 'referees' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400 px-1">Provide up to 3 referees with contacts.</p>
            {([0, 1, 2] as const).map(i => (
              <div key={i} className="card space-y-3">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <Users size={14}/> Referee {i + 1}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Full Name</label>
                    <input className="input" value={referees[i].name}
                      onChange={e => { const r = referees.map((x,j) => j===i ? { ...x, name: e.target.value } : x); setReferees(r); }} />
                  </div>
                  <div>
                    <label className="label">Title / Position</label>
                    <input className="input" value={referees[i].title}
                      onChange={e => { const r = referees.map((x,j) => j===i ? { ...x, title: e.target.value } : x); setReferees(r); }} />
                  </div>
                  <div>
                    <label className="label">Phone</label>
                    <input className="input" value={referees[i].phone}
                      onChange={e => { const r = referees.map((x,j) => j===i ? { ...x, phone: e.target.value } : x); setReferees(r); }} />
                  </div>
                  <div>
                    <label className="label">Email</label>
                    <input className="input" type="email" value={referees[i].email}
                      onChange={e => { const r = referees.map((x,j) => j===i ? { ...x, email: e.target.value } : x); setReferees(r); }} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Address</label>
                    <input className="input" value={referees[i].address}
                      onChange={e => { const r = referees.map((x,j) => j===i ? { ...x, address: e.target.value } : x); setReferees(r); }} />
                  </div>
                </div>
              </div>
            ))}
            {refErr && (
              <p className={`text-sm px-1 ${refErr === 'Saved!' ? 'text-emerald-500' : 'text-red-400'}`}>{refErr}</p>
            )}
            {isEdit && (
              <div className="flex justify-end">
                <button type="button" className="btn-primary text-xs" onClick={saveReferees}>
                  <Save size={13}/> Save Referees
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════ OTHER ══════════════════════ */}
        {tab === 'other' && (() => {
          const isTeacher = /teach/i.test(personal.typeOfWork) || /teacher/i.test(empForm.jobTitle);
          return (
          <div className="card space-y-5">
            <div>
              <SectionHdr>Other Areas of Job Interest (Other Than One Applied For)</SectionHdr>
              <textarea className="input resize-none" rows={3} value={extended.otherJobInterests} onChange={setExt('otherJobInterests')}
                placeholder="List any other areas of interest…" />
            </div>
            <div>
              <SectionHdr>Earlier Responsibilities</SectionHdr>
              <textarea className="input resize-none" rows={3} value={extended.earlierResponsibilities} onChange={setExt('earlierResponsibilities')}
                placeholder="Describe earlier responsibilities and roles you have held…" />
            </div>
            <div>
              <SectionHdr>Special Courses</SectionHdr>
              <textarea className="input resize-none" rows={3} value={extended.specialCourses} onChange={setExt('specialCourses')}
                placeholder="List any special courses, workshops, seminars attended…" />
            </div>
            <div>
              <SectionHdr>Other Skills</SectionHdr>
              <textarea className="input resize-none" rows={3} value={extended.otherSkills} onChange={setExt('otherSkills')}
                placeholder="e.g. Computer skills, first aid, driving, languages spoken…" />
            </div>
            <div>
              <SectionHdr>Subjects of Preference {isTeacher && <span className="text-xs font-normal normal-case tracking-normal text-blue-500 ml-1">(teacher)</span>}</SectionHdr>
              <textarea className="input resize-none" rows={3} value={extended.subjectsOfPreference} onChange={setExt('subjectsOfPreference')}
                placeholder="e.g. Mathematics, English, Biology…" />
            </div>
            <div>
              <SectionHdr>Any Other Information for Employer</SectionHdr>
              <textarea className="input resize-none" rows={3} value={extended.otherInformation} onChange={setExt('otherInformation')}
                placeholder="Any other information you may want your employer to know…" />
            </div>
          </div>
          );
        })()}

        {/* ══════════════════════ PAYROLL / IDs ══════════════════════ */}
        {tab === 'payroll' && (
          <div className="card space-y-6">
            <SectionHdr>Government Identification Numbers</SectionHdr>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">TIN (Tax Identification Number)</label>
                <input className="input" value={personal.tin}
                  onChange={e => setPersonal(p => ({ ...p, tin: e.target.value }))}
                  placeholder="e.g. 1234567890" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">NSSF Number</label>
                <input className="input" value={personal.nssfNumber}
                  onChange={e => setPersonal(p => ({ ...p, nssfNumber: e.target.value }))}
                  placeholder="e.g. CF/123456" />
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <CreditCard size={13} /> Bank Accounts
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Bank account details are managed from the employee's <strong>profile page</strong> — save this form first, then open the profile to add bank accounts.
              </p>
            </div>
          </div>
        )}

        {/* ══════════════════════ MEDICAL ══════════════════════ */}
        {tab === 'medical' && (
          <div className="card space-y-5">
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <Activity size={18} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Write any type of illness that you normally suffer from and what emergency treatment you get.
                You may indicate details of doctors and hospital / clinic where you are normally treated.
              </p>
            </div>
            <div>
              <SectionHdr>Medical Background</SectionHdr>
              <textarea className="input resize-none" rows={6} value={extended.medicalBackground} onChange={setExt('medicalBackground')}
                placeholder="e.g. &#10;Illness: Asthma&#10;Emergency treatment: Salbutamol inhaler&#10;Doctor: Dr. Ssali&#10;Hospital/Clinic: Nsambya Hospital" />
            </div>
          </div>
        )}

        {/* ══════════════════════ DECLARATION ══════════════════════ */}
        {tab === 'declaration' && (
          <div className="card space-y-5">
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm text-slate-600 dark:text-slate-300 italic">
              "I certify that the information given on this form is true and pledge to update it as soon as there is any change."
            </div>

            <SectionHdr>Declaration — Signed By</SectionHdr>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Name</label>
                <input className="input" value={decl.declarationName} onChange={setDeclF('declarationName')} />
              </div>
              <div>
                <label className="label">Title</label>
                <input className="input" value={decl.declarationTitle} onChange={setDeclF('declarationTitle')} />
              </div>
              <div>
                <label className="label">Date</label>
                <input className="input" type="date" value={decl.declarationDate} onChange={setDeclF('declarationDate')} />
              </div>
            </div>
            <div>
              <label className="label">Signature</label>
              <SignaturePad value={decl.declarationSignature}
                onChange={v => setDecl(p => ({ ...p, declarationSignature: v }))} />
            </div>

            <SectionHdr>Witnessed By</SectionHdr>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Name</label>
                <input className="input" value={decl.witnessName} onChange={setDeclF('witnessName')} />
              </div>
              <div>
                <label className="label">Title</label>
                <input className="input" value={decl.witnessTitle} onChange={setDeclF('witnessTitle')} />
              </div>
              <div>
                <label className="label">Tel No.</label>
                <input className="input" value={decl.witnessTel} onChange={setDeclF('witnessTel')} />
              </div>
            </div>
            <div>
              <label className="label">Witness Signature</label>
              <SignaturePad value={decl.witnessSignature}
                onChange={v => setDecl(p => ({ ...p, witnessSignature: v }))} />
            </div>

            <SectionHdr><span className="flex items-center gap-1.5"><Upload size={13}/> Scanned Paper Form</span></SectionHdr>
            <p className="text-xs text-slate-400">If the biodata was completed in hard copy, upload a scan here (PDF or image).</p>
            <label className="no-print flex items-center gap-3 p-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg cursor-pointer hover:border-brand-400 transition-colors group">
              <Upload size={18} className="text-slate-400 group-hover:text-brand-400 transition-colors shrink-0" />
              <span className="text-sm text-slate-500">
                {scannedFile ? scannedFile.name : 'Click to select scanned form…'}
              </span>
              <input type="file" accept="image/*,.pdf" className="hidden"
                onChange={e => setScannedFile(e.target.files?.[0] ?? null)} />
            </label>
            {scannedFile && (
              <div className="no-print flex items-center gap-2">
                <span className="text-xs text-emerald-600 font-medium">✓ {scannedFile.name}</span>
                <button type="button" onClick={() => setScannedFile(null)}
                  className="text-xs text-slate-400 hover:text-red-400 underline">Remove</button>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════ EMPLOYMENT (new only) ══════════════════════ */}
        {tab === 'employment' && (
          <div className="card space-y-4">
            <SectionHdr>Station &amp; Position</SectionHdr>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Station *</label>
                <select className="input" value={empForm.campusId}
                  onChange={e => setEmpForm(p => ({ ...p, campusId: e.target.value, departmentId:'' }))}>
                  <option value="">— Select Station —</option>
                  {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Department *</label>
                <select className="input" value={empForm.departmentId} onChange={setEF('departmentId')}>
                  <option value="">— Select Department —</option>
                  {allDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Job Title *</label>
                <input className="input" list="jt-emp" value={empForm.jobTitle} onChange={setEF('jobTitle')} />
                <datalist id="jt-emp">{jobTitles.map(j => <option key={j.id} value={j.title}/>)}</datalist>
              </div>
              <div>
                <label className="label">Pay Grade</label>
                <input className="input" placeholder="e.g. U4, P2" value={empForm.payGrade} onChange={setEF('payGrade')} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Contract Type *</label>
                <select className="input" value={empForm.contractType} onChange={setEF('contractType')}>
                  <option value="permanent">Permanent</option>
                  <option value="contract">Contract</option>
                  <option value="probation">Probation</option>
                  <option value="casual">Casual</option>
                  <option value="internship">Internship</option>
                </select>
              </div>
              <div>
                <label className="label">Start Date *</label>
                <input className="input" type="date" value={empForm.startDate} onChange={setEF('startDate')} />
              </div>
            </div>
            <SectionHdr>Initial Salary (optional)</SectionHdr>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="label">Amount</label>
                <input className="input" type="number" min="0" step="0.01" placeholder="e.g. 1500000"
                  value={empForm.salaryAmount} onChange={setEF('salaryAmount')} />
              </div>
              <div>
                <label className="label">Currency</label>
                <select className="input" value={empForm.salaryCurrency} onChange={setEF('salaryCurrency')}>
                  <option value="UGX">UGX</option>
                  <option value="USD">USD</option>
                  <option value="KES">KES</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && <p className="text-red-400 text-sm px-1">{error}</p>}

        {/* Prev / Next / Submit */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={goPrev}
            disabled={isFirstTab}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={15} /> Previous
          </button>

          {isLastTab ? (
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              <Save size={15}/>
              {save.isPending ? 'Saving…' : isEdit ? 'Update Staff' : 'Save Staff'}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="btn-primary flex items-center gap-1.5"
            >
              Next <ChevronRight size={15} />
            </button>
          )}
        </div>

      </form>
      </div>{/* end #sak-digital-form */}
    </div>
  );
}
