import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, User, Briefcase, ArrowLeftRight, BarChart2, BookOpen, FileText, Pencil, Trash2, Upload, Eye, Download, GraduationCap, Camera, CreditCard, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { formatDate, yearsFrom } from '@sak/shared';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string) ?? 'http://localhost:4000';
const API_ROOT = import.meta.env.DEV ? '' : SERVER_URL;

/** Fetch a document as a blob URL (auth-aware). Auto-revokes on unmount. */
function useDocumentBlob(docId: string | undefined) {
  const [url, setUrl] = React.useState<string | null>(null);
  useEffect(() => {
    if (!docId) { setUrl(null); return; }
    let active = true;
    const token = localStorage.getItem('sak_token');
    fetch(`${API_ROOT}/api/documents/${docId}/file`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    })
      .then((res) => (res.ok ? res.blob() : Promise.reject()))
      .then((blob) => { if (active) setUrl(URL.createObjectURL(blob)); })
      .catch(() => {});
    return () => { active = false; };
  }, [docId]);
  useEffect(() => {
    return () => { if (url) URL.revokeObjectURL(url); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return url;
}

type Tab = 'profile' | 'employment' | 'transfers' | 'performance' | 'training' | 'documents';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'profile',    label: 'Profile',     icon: User },
  { key: 'employment', label: 'Employment',  icon: Briefcase },
  { key: 'transfers',  label: 'Transfers',   icon: ArrowLeftRight },
  { key: 'performance',label: 'Performance', icon: BarChart2 },
  { key: 'training',   label: 'Training',    icon: BookOpen },
  { key: 'documents',  label: 'Documents',   icon: FileText },
];

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = React.useState<Tab>('profile');
  const { hasPermission } = useAuthStore();

  const { data: employee, isLoading } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => window.sakAPI.employees.get(id!),
    enabled: !!id,
  });

  const emp = employee as EmpShape | undefined;

  if (isLoading) return (
    <div className="p-6 flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
    </div>
  );

  if (!emp) return (
    <div className="p-6">
      <p className="text-slate-400">Employee not found.</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Back + Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-400 hover:text-slate-100 transition-colors mt-1">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {emp.first_name} {emp.middle_name ? `${emp.middle_name} ` : ''}{emp.last_name}
            </h1>
            {emp.is_active
              ? <span className="badge-active">Active</span>
              : <span className="badge-inactive">Inactive</span>
            }
          </div>
          <p className="text-brand-400 font-mono text-sm mt-0.5">{emp.staff_no}</p>
        </div>
        {hasPermission('staff_profiles', 'update') && (
          <button
            onClick={() => navigate(`/employees/${emp.id}/edit`)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-brand-500 dark:hover:text-brand-400 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
          >
            <Pencil size={13} /> Edit
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === key
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'profile' && (
          <ProfileTab emp={emp} />
        )}

        {activeTab === 'employment' && <EmploymentTab employeeId={emp.id} />}
        {activeTab === 'transfers' && <TransfersTab employeeId={emp.id} />}
        {activeTab === 'performance' && <PerformanceTab employeeId={emp.id} />}
        {activeTab === 'training' && <TrainingTab employeeId={emp.id} />}
        {activeTab === 'documents' && <DocumentsTab employeeId={emp.id} />}
      </div>
    </div>
  );
}

// ── Sub-tabs ─────────────────────────────────────────────────────────────────

type EmpShape = {
  id: string; staff_no: string; first_name: string; middle_name?: string; last_name: string;
  gender: string; date_of_birth: string; nationality: string; national_id?: string;
  passport_no?: string; blood_group?: string;
  phone: string; phone2?: string; email?: string; residential_address?: string;
  marital_status?: string; religion?: string; is_active: boolean;
  emergencyContacts?: { id: string; full_name: string; relationship: string; phone: string }[];
  education?: { id: string; institution: string; qualification: string; field_of_study?: string; year_from: number; year_to: number; grade?: string }[];
};

/** Quick single-file upload modal for passport photo / national ID */
function QuickDocUpload({ employeeId, category, label, onClose }: {
  employeeId: string; category: string; label: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setErr('Please select a file'); return; }
    setBusy(true);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('employeeId', employeeId);
      fd.append('category', category);
      fd.append('title', title || file.name.replace(/\.[^.]+$/, ''));
      await window.sakAPI.documents.upload(fd);
      qc.invalidateQueries({ queryKey: ['documents', employeeId] });
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? e?.message ?? 'Upload failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Upload {label}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Select File *</label>
            <input type="file" className="input text-sm" required
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''));
              }} />
            <p className="text-xs text-slate-400 mt-1">PDF, Word, JPG, PNG · max 10 MB</p>
          </div>
          <div>
            <label className="label">Title / Description</label>
            <input className="input" placeholder={`e.g. ${label}`} value={title}
              onChange={(e) => setTitle(e.target.value)} />
          </div>
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary text-sm" disabled={busy}>
              {busy ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfileTab({ emp }: { emp: EmpShape }) {
  const { data: allDocs = [] } = useQuery({
    queryKey: ['documents', emp.id],
    queryFn: () => window.sakAPI.documents.list({ employeeId: emp.id }),
    staleTime: 60_000,
  });
  const docs = allDocs as { id: string; category: string; title: string }[];

  // Find latest passport photo and national ID doc
  const passportPhotos = docs.filter((d) => d.category === 'passport_photo');
  const nationalIdDocs  = docs.filter((d) => d.category === 'identification');
  const latestPhoto = passportPhotos[passportPhotos.length - 1];
  const latestId    = nationalIdDocs[nationalIdDocs.length - 1];

  const photoUrl = useDocumentBlob(latestPhoto?.id);

  const [quickUpload, setQuickUpload] = useState<{ category: string; label: string } | null>(null);

  return (
    <div className="space-y-6">
      {/* ── Avatar + name banner ── */}
      <div className="card flex items-center gap-5">
        {/* Avatar / passport photo */}
        <div className="relative shrink-0 group">
          {photoUrl ? (
            <img src={photoUrl} alt="Passport photo"
              className="w-20 h-20 rounded-full object-cover border-2 border-brand-500/40" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center text-2xl font-bold select-none border-2 border-dashed border-brand-500/30">
              {emp.first_name[0]}{emp.last_name[0]}
            </div>
          )}
          <button
            onClick={() => setQuickUpload({ category: 'passport_photo', label: 'Passport Photo' })}
            className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            title="Upload passport photo"
          >
            <Camera size={18} className="text-white" />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {emp.first_name} {emp.middle_name ? `${emp.middle_name} ` : ''}{emp.last_name}
          </h2>
          <p className="text-xs font-mono text-brand-400">{emp.staff_no}</p>
          <p className="text-xs text-slate-500 mt-0.5 capitalize">{emp.nationality}{emp.gender ? ` · ${emp.gender}` : ''}</p>
        </div>
        <div className="ml-auto shrink-0">
          {emp.is_active
            ? <span className="badge-active">Active</span>
            : <span className="badge-inactive">Inactive</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal information */}
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Personal Information</h3>
          {([
            ['Gender', emp.gender],
            ['Date of Birth', emp.date_of_birth ? formatDate(emp.date_of_birth) : '–'],
            ['Age', emp.date_of_birth ? `${yearsFrom(emp.date_of_birth)} years` : '–'],
            ['Nationality', emp.nationality],
            ['National ID', emp.national_id ?? '–'],
            ['Passport No', emp.passport_no ?? '–'],
            ['Blood Group', emp.blood_group ?? '–'],
            ['Marital Status', emp.marital_status ?? '–'],
            ['Religion', emp.religion ?? '–'],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-slate-400">{label}</span>
              <span className="text-slate-800 dark:text-slate-100 capitalize">{value}</span>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          {/* Contact Details */}
          <div className="card space-y-3">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Contact Details</h3>
            {([
              ['Phone', emp.phone],
              ['Phone 2', emp.phone2 ?? '–'],
              ['Email', emp.email ?? '–'],
              ['Address', emp.residential_address ?? '–'],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-slate-400">{label}</span>
                <span className="text-slate-800 dark:text-slate-100 text-right max-w-xs">{value}</span>
              </div>
            ))}
          </div>

          {/* ID Documents quick panel */}
          <div className="card space-y-3">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <CreditCard size={14} /> ID Documents
            </h3>

            {/* Passport Photo row */}
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-slate-500">
                {latestPhoto
                  ? <CheckCircle2 size={14} className="text-emerald-400" />
                  : <AlertCircle size={14} className="text-amber-400" />}
                Passport Photo
              </span>
              {latestPhoto ? (
                <button onClick={() => window.sakAPI.documents.openFile(latestPhoto.id)}
                  className="text-xs text-brand-400 hover:underline flex items-center gap-1"><Eye size={11} /> View</button>
              ) : (
                <button onClick={() => setQuickUpload({ category: 'passport_photo', label: 'Passport Photo' })}
                  className="text-xs text-amber-400 hover:underline flex items-center gap-1"><Upload size={11} /> Upload</button>
              )}
            </div>

            {/* National ID row */}
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-slate-500">
                {latestId
                  ? <CheckCircle2 size={14} className="text-emerald-400" />
                  : <AlertCircle size={14} className="text-amber-400" />}
                National ID Copy
              </span>
              {latestId ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => window.sakAPI.documents.openFile(latestId.id)}
                    className="text-xs text-brand-400 hover:underline flex items-center gap-1"><Eye size={11} /> View</button>
                  <button onClick={() => window.sakAPI.documents.downloadFile(latestId.id, latestId.title)}
                    className="text-xs text-emerald-400 hover:underline flex items-center gap-1"><Download size={11} /> Save</button>
                </div>
              ) : (
                <button onClick={() => setQuickUpload({ category: 'identification', label: 'National ID Copy' })}
                  className="text-xs text-amber-400 hover:underline flex items-center gap-1"><Upload size={11} /> Upload</button>
              )}
            </div>
          </div>
        </div>

        {/* Education — always visible */}
        <div className="card md:col-span-2">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
            <GraduationCap size={14} /> Academic / Education
          </h3>
          {!emp.education?.length ? (
            <p className="text-slate-400 text-sm">No academic records. Add them via Edit Profile → Academic tab.</p>
          ) : (
            <div className="space-y-3">
              {emp.education.map((e) => (
                <div key={e.id} className="flex justify-between gap-4 text-sm border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="text-slate-800 dark:text-slate-100 font-medium">{e.qualification}</p>
                    <p className="text-slate-500">{e.institution}{e.field_of_study ? ` · ${e.field_of_study}` : ''}</p>
                    {e.grade && <p className="text-xs text-emerald-500 dark:text-emerald-400">{e.grade}</p>}
                  </div>
                  <span className="text-slate-400 text-xs shrink-0">{e.year_from}–{e.year_to}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Emergency Contacts */}
        {emp.emergencyContacts?.length ? (
          <div className="card md:col-span-2">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">Emergency Contacts</h3>
            <div className="space-y-2">
              {emp.emergencyContacts.map((c) => (
                <div key={c.id} className="flex justify-between text-sm">
                  <div>
                    <p className="text-slate-800 dark:text-slate-100">{c.full_name}</p>
                    <p className="text-slate-400 capitalize">{c.relationship}</p>
                  </div>
                  <span className="text-brand-400">{c.phone}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {quickUpload && (
        <QuickDocUpload
          employeeId={emp.id}
          category={quickUpload.category}
          label={quickUpload.label}
          onClose={() => setQuickUpload(null)}
        />
      )}
    </div>
  );
}

function EmploymentTab({ employeeId }: { employeeId: string }) {
  const { data = [] } = useQuery({
    queryKey: ['employment', employeeId],
    queryFn: () => window.sakAPI.employment.getByEmployee(employeeId),
  });
  const records = data as {
    id: string; job_title: string; contract_type: string; status: string;
    start_date: string; campus_name: string; department_name: string;
    salaryHistory?: { id: string; amount: number; currency: string; effective_date: string }[];
  }[];

  return (
    <div className="space-y-4">
      {records.length === 0 && <p className="text-slate-500 text-sm">No employment records</p>}
      {records.map((r) => (
        <div key={r.id} className="card space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{r.job_title}</p>
              <p className="text-sm text-slate-400">{r.campus_name} · {r.department_name}</p>
            </div>
            <span className={`badge-${r.status === 'active' ? 'active' : 'inactive'}`}>{r.status}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-slate-400">Contract: <span className="text-slate-800 dark:text-slate-100 capitalize">{r.contract_type}</span></span>
            <span className="text-slate-400">Start: <span className="text-slate-800 dark:text-slate-100">{formatDate(r.start_date)}</span></span>
          </div>
          {r.salaryHistory?.length ? (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Latest Salary</p>
              <p className="text-brand-400 font-semibold">
                {r.salaryHistory[0].currency} {Number(r.salaryHistory[0].amount).toLocaleString()}
              </p>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TransfersTab({ employeeId }: { employeeId: string }) {
  const { data = [] } = useQuery({
    queryKey: ['transfers', employeeId],
    queryFn: () => window.sakAPI.transfers.list({ employeeId }),
  });
  const records = data as { id: string; type: string; status: string; from_campus_name: string; to_campus_name: string; effective_date: string; reason: string }[];

  return (
    <div className="space-y-3">
      {records.length === 0 && <p className="text-slate-500 text-sm">No transfer records</p>}
      {records.map((r) => (
        <div key={r.id} className="card flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 capitalize">{r.type}</p>
            <p className="text-xs text-slate-400">{r.from_campus_name} → {r.to_campus_name}</p>
            <p className="text-xs text-slate-500 mt-1">{r.reason}</p>
          </div>
          <div className="text-right shrink-0">
            <span className={`badge-${r.status === 'approved' ? 'approved' : r.status === 'pending' ? 'pending' : 'inactive'}`}>
              {r.status}
            </span>
            <p className="text-xs text-slate-500 mt-1">{formatDate(r.effective_date)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function PerformanceTab({ employeeId }: { employeeId: string }) {
  const { data = [] } = useQuery({
    queryKey: ['performance', employeeId],
    queryFn: () => window.sakAPI.performance.list({ employeeId }),
  });
  const records = data as { id: string; period: string; academic_year: string; overall_score: number; overall_rating: string; conducted_date: string }[];

  return (
    <div className="space-y-3">
      {records.length === 0 && <p className="text-slate-500 text-sm">No appraisal records</p>}
      {records.map((r) => (
        <div key={r.id} className="card flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 capitalize">{r.period.replace('_', ' ')} – {r.academic_year}</p>
            <p className="text-xs text-slate-500">{formatDate(r.conducted_date)}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-brand-400">{Number(r.overall_score).toFixed(1)}/5</p>
            <p className="text-xs text-slate-400">{r.overall_rating}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrainingTab({ employeeId }: { employeeId: string }) {
  const { data = [] } = useQuery({
    queryKey: ['training', employeeId],
    queryFn: () => window.sakAPI.training.list({ employeeId }),
  });
  const records = data as { id: string; title: string; provider: string; type: string; start_date: string; duration_days: number; skills: string }[];

  return (
    <div className="space-y-3">
      {records.length === 0 && <p className="text-slate-500 text-sm">No training records</p>}
      {records.map((r) => (
        <div key={r.id} className="card">
          <p className="font-medium text-slate-800 dark:text-slate-100">{r.title}</p>
          <p className="text-sm text-slate-400">{r.provider} · <span className="capitalize">{r.type}</span></p>
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
            <span>{formatDate(r.start_date)}</span>
            <span>{r.duration_days} day(s)</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const DOC_CATEGORIES = [
  { value: 'academic',       label: 'Academic Certificate' },
  { value: 'professional',   label: 'Professional Certificate' },
  { value: 'identification', label: 'Identification' },
  { value: 'contract',       label: 'Contract / Appointment Letter' },
  { value: 'nssf',           label: 'NSSF / Pension' },
  { value: 'medical',        label: 'Medical / Health' },
  { value: 'passport_photo', label: 'Passport Photo' },
  { value: 'other',          label: 'Other' },
];

function DocumentsTab({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'academic', issuedDate: '', expiryDate: '' });
  const [file, setFile]   = useState<File | null>(null);
  const [formErr, setFormErr] = useState('');

  const { data = [], isLoading } = useQuery({
    queryKey: ['documents', employeeId],
    queryFn: () => window.sakAPI.documents.list({ employeeId }),
  });
  const records = data as { id: string; title: string; category: string; mime_type: string; created_at: string; issued_date?: string; expiry_date?: string; file_size_bytes: number }[];

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('No file selected');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('employeeId', employeeId);
      fd.append('category', form.category);
      fd.append('title', form.title || file.name);
      if (form.issuedDate)  fd.append('issuedDate',  form.issuedDate);
      if (form.expiryDate)  fd.append('expiryDate',  form.expiryDate);
      return window.sakAPI.documents.upload(fd);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', employeeId] });
      setShowUpload(false);
      setForm({ title: '', category: 'academic', issuedDate: '', expiryDate: '' });
      setFile(null);
      setFormErr('');
      if (fileRef.current) fileRef.current.value = '';
    },
    onError: (e: any) => setFormErr(e?.response?.data?.message ?? e?.message ?? 'Upload failed'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => window.sakAPI.documents.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents', employeeId] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{records.length} document(s)</p>
        <button className="btn-primary text-xs px-3 py-1.5" onClick={() => { setFormErr(''); setShowUpload(true); }}>
          <Upload size={13} /> Upload Document
        </button>
      </div>

      {isLoading && <p className="text-slate-500 text-sm">Loading…</p>}
      {!isLoading && records.length === 0 && <p className="text-slate-500 text-sm">No documents uploaded yet</p>}
      {records.map((r) => (
        <div key={r.id} className="card flex items-center gap-3">
          {/* file type icon */}
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
            r.mime_type?.startsWith('image/') ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-500'
            : r.mime_type === 'application/pdf' ? 'bg-red-100 dark:bg-red-900/40 text-red-500'
            : 'bg-blue-100 dark:bg-blue-900/40 text-blue-500'
          }`}>
            {r.mime_type?.startsWith('image/') ? 'IMG' : r.mime_type === 'application/pdf' ? 'PDF' : 'DOC'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{r.title}</p>
            <p className="text-xs text-slate-500">
              {DOC_CATEGORIES.find(c => c.value === r.category)?.label ?? r.category} · {(r.file_size_bytes / 1024).toFixed(0)} KB
            </p>
            <p className="text-xs text-slate-400">
              {r.issued_date ? `Issued: ${formatDate(r.issued_date)}` : formatDate(r.created_at)}
              {r.expiry_date ? ` · Expires: ${formatDate(r.expiry_date)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => window.sakAPI.documents.openFile(r.id)}
              className="p-1.5 text-slate-400 hover:text-brand-400 transition-colors" title="View">
              <Eye size={14} />
            </button>
            <button onClick={() => window.sakAPI.documents.downloadFile(r.id, r.title)}
              className="p-1.5 text-slate-400 hover:text-emerald-400 transition-colors" title="Download">
              <Download size={14} />
            </button>
            <button onClick={() => { if (confirm('Delete this document?')) remove.mutate(r.id); }}
              className="p-1.5 text-slate-400 hover:text-red-500 transition-colors" title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">Upload Document</h2>
              <button onClick={() => setShowUpload(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>
            <form className="p-5 space-y-4" onSubmit={(e) => { e.preventDefault(); upload.mutate(); }}>
              <div>
                <label className="label">File *</label>
                <input ref={fileRef} type="file" className="input text-sm" required
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    if (f && !form.title) setForm((fm) => ({ ...fm, title: f.name.replace(/\.[^.]+$/, '') }));
                  }} />
                <p className="text-xs text-slate-400 mt-1">PDF, Word, or Image · max 10 MB</p>
              </div>
              <div>
                <label className="label">Category *</label>
                <select className="input" required value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                  {DOC_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Title / Description *</label>
                <input className="input" required placeholder="e.g. Bachelor of Education — Makerere 2010"
                  value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Issue Date</label>
                  <input type="date" className="input" value={form.issuedDate}
                    onChange={(e) => setForm((f) => ({ ...f, issuedDate: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Expiry Date</label>
                  <input type="date" className="input" value={form.expiryDate}
                    onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
                </div>
              </div>
              {formErr && <p className="text-red-400 text-sm">{formErr}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setShowUpload(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={upload.isPending}>
                  {upload.isPending ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
