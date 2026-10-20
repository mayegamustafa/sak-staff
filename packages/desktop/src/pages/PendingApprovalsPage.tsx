import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck, RefreshCw, CheckCircle2, XCircle, Eye, X,
  User, Phone, Mail, Calendar, MapPin, BookOpen, Briefcase, Users, FileText, Heart,
  ChevronRight,
} from 'lucide-react';
import {
  apiOnboardingPendingList,
  apiOnboardingGetPendingDetail,
  apiOnboardingApprove,
  apiOnboardingReject,
  isElectron,
} from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────
interface EContact  { id: string; full_name: string; relationship: string; phone: string; phone2?: string; address?: string; }
interface EduRecord { id: string; institution: string; qualification: string; field_of_study: string; year_from: number; year_to: number; grade?: string; honours?: string; }
interface WorkRecord{ id: string; organisation: string; title: string; period_from: string; period_to: string; supervisor_name?: string; }
interface Referee   { id: string; name: string; title?: string; phone?: string; email?: string; address?: string; }
interface Doc       { id: string; category: string; title: string; file_path: string; mime_type: string; file_size_bytes: number; created_at: string; }

interface FullEmployee {
  id: string; staff_no: string; first_name: string; middle_name: string | null; last_name: string;
  gender: string|null; date_of_birth: string|null; nationality: string|null; tribe: string|null;
  religion: string|null; blood_group: string|null; marital_status: string|null;
  national_id: string|null; passport_no: string|null; nssf_number: string|null; tin: string|null;
  phone: string; phone2: string|null; whatsapp_phone: string|null; email: string|null;
  residential_address: string|null; village: string|null;
  spouse_name: string|null; spouse_phone: string|null; no_of_children: number|null; parents_names: string|null;
  subjects_of_preference: string|null; other_skills: string|null; earlier_responsibilities: string|null;
  other_job_interests: string|null; special_courses: string|null;
  medical_background: string|null; other_information: string|null;
  campus_id: string|null; campus_name: string|null;
  created_at: string;
  emergencyContacts: EContact[];
  educationRecords: EduRecord[];
  workHistory: WorkRecord[];
  referees: Referee[];
  documents: Doc[];
}

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string) || '';
const API_ROOT = import.meta.env.DEV ? '' : SERVER_URL;

/**
 * Open a staff document in a new tab.
 *
 * Documents are personal data (national IDs, contracts) and are only reachable
 * through the authenticated endpoint, so fetch the bytes with the bearer token
 * and hand the browser a blob URL rather than linking at the file directly.
 */
async function openDocument(docId: string): Promise<void> {
  // Desktop: the bearer token lives in the main process, so it opens the file.
  if (isElectron()) {
    const result = await window.sakAPI.documents.openFile(docId);
    if (result && typeof result === 'object' && result.success === false) {
      alert(result.message ?? 'Could not open this document.');
    }
    return;
  }
  const token = localStorage.getItem('sak_token');
  try {
    const res = await fetch(`${API_ROOT}/api/documents/${docId}/file`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    });
    if (!res.ok) throw new Error(String(res.status));
    const url = URL.createObjectURL(await res.blob());
    window.open(url, '_blank', 'noopener,noreferrer');
    // Give the new tab time to load before releasing the object URL.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    alert('Could not open this document. You may not have permission to view it.');
  }
}
const fmtDate = (s: string|null|undefined) =>
  s ? new Date(s).toLocaleDateString('en-UG', { day:'numeric', month:'short', year:'numeric' }) : '—';
const fmtBytes = (n: number) =>
  n > 1_000_000 ? `${(n/1_000_000).toFixed(1)} MB` : `${Math.round(n/1024)} KB`;
const fullName = (e: { first_name:string; middle_name?:string|null; last_name:string }) =>
  [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' ');

// ── Small layout helpers ──────────────────────────────────────────────────────
function Row({ label, value }: { label: string; value: string|number|null|undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex gap-2 py-1 text-sm">
      <span className="w-48 shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium">{String(value)}</span>
    </div>
  );
}
function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
        <Icon className="w-4 h-4 text-blue-500" />
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ── Review Drawer ─────────────────────────────────────────────────────────────
function ReviewDrawer({
  empId, onClose, onApproved, onRejected,
}: {
  empId: string;
  onClose: () => void;
  onApproved: (id: string) => void;
  onRejected: (id: string) => void;
}) {
  const [emp, setEmp]         = useState<FullEmployee|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string|null>(null);
  const [busy, setBusy]       = useState<'approve'|'reject'|null>(null);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason]   = useState('');
  const [toast, setToast]     = useState<{msg:string; ok:boolean}|null>(null);
  const [jobTitle, setJobTitle]       = useState('');
  const [contractType, setContractType] = useState('permanent');
  const [startDate, setStartDate]     = useState('');

  const flash = (msg: string, ok=true) => { setToast({msg,ok}); setTimeout(()=>setToast(null),3000); };

  useEffect(() => {
    setLoading(true);
    apiOnboardingGetPendingDetail(empId)
      .then(d => setEmp(d as FullEmployee))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [empId]);

  const doApprove = async () => {
    if (!emp || !window.confirm(`Approve and activate ${fullName(emp)}?`)) return;
    setBusy('approve');
    try {
      await apiOnboardingApprove(emp.id, {
        job_title:     jobTitle.trim() || undefined,
        contract_type: contractType || undefined,
        start_date:    startDate || undefined,
      });
      flash(`${fullName(emp)} approved.`);
      setTimeout(() => { onApproved(emp.id); onClose(); }, 1200);
    } catch(e){ flash((e as Error).message, false); }
    finally { setBusy(null); }
  };

  const doReject = async () => {
    if (!emp) return;
    setBusy('reject');
    try {
      await apiOnboardingReject(emp.id, reason.trim()||undefined);
      flash(`${fullName(emp)} rejected.`, false);
      setTimeout(() => { onRejected(emp.id); onClose(); }, 1200);
    } catch(e){ flash((e as Error).message, false); }
    finally { setBusy(null); }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-white shadow-2xl flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
              {emp ? emp.first_name[0]+emp.last_name[0] : '?'}
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-lg leading-tight">{emp ? fullName(emp) : 'Loading…'}</h2>
              <p className="text-xs text-gray-400">
                {emp?.staff_no} · Submitted {fmtDate(emp?.created_at)}
                {emp?.campus_name && <> · <span className="text-blue-600 font-medium">{emp.campus_name}</span></>}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg"><X className="w-5 h-5 text-gray-500"/></button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && <div className="flex items-center justify-center h-40 text-gray-400"><RefreshCw className="animate-spin w-5 h-5 mr-2"/>Loading details…</div>}
          {error   && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

          {emp && !loading && (<>
            <Section icon={User} title="Personal Information">
              <Row label="Full Name"            value={fullName(emp)} />
              <Row label="Gender"               value={emp.gender} />
              <Row label="Date of Birth"        value={fmtDate(emp.date_of_birth)} />
              <Row label="Nationality"          value={emp.nationality} />
              <Row label="Tribe"                value={emp.tribe} />
              <Row label="Religion"             value={emp.religion} />
              <Row label="Blood Group"          value={emp.blood_group} />
              <Row label="Marital Status"       value={emp.marital_status} />
              <Row label="National ID"          value={emp.national_id} />
              <Row label="Passport No."         value={emp.passport_no} />
              <Row label="NSSF No."             value={emp.nssf_number} />
              <Row label="TIN"                  value={emp.tin} />
            </Section>

            <Section icon={Phone} title="Contact & Address">
              <Row label="Phone"                value={emp.phone} />
              <Row label="Phone 2"              value={emp.phone2} />
              <Row label="WhatsApp"             value={emp.whatsapp_phone} />
              <Row label="Email"                value={emp.email} />
              <Row label="Residential Address"  value={emp.residential_address} />
              <Row label="Village"              value={emp.village} />
            </Section>

            {(emp.spouse_name||emp.no_of_children!=null||emp.parents_names) && (
              <Section icon={Heart} title="Family">
                <Row label="Spouse Name"        value={emp.spouse_name} />
                <Row label="Spouse Phone"       value={emp.spouse_phone} />
                <Row label="No. of Children"    value={emp.no_of_children} />
                <Row label="Parents' Names"     value={emp.parents_names} />
              </Section>
            )}

            {(emp.subjects_of_preference||emp.other_skills||emp.earlier_responsibilities||emp.other_job_interests||emp.special_courses) && (
              <Section icon={Briefcase} title="Employment Intent">
                <Row label="Subjects / Preference"    value={emp.subjects_of_preference} />
                <Row label="Other Skills"             value={emp.other_skills} />
                <Row label="Earlier Responsibilities" value={emp.earlier_responsibilities} />
                <Row label="Other Job Interests"      value={emp.other_job_interests} />
                <Row label="Special Courses"          value={emp.special_courses} />
              </Section>
            )}

            {(emp.medical_background||emp.other_information) && (
              <Section icon={Heart} title="Health & Other">
                <Row label="Medical Background" value={emp.medical_background} />
                <Row label="Other Information"  value={emp.other_information} />
              </Section>
            )}

            {emp.emergencyContacts?.length > 0 && (
              <Section icon={Phone} title="Emergency Contacts">
                {emp.emergencyContacts.map(c=>(
                  <div key={c.id} className="mb-3 pl-3 border-l-2 border-blue-200">
                    <p className="text-sm font-semibold text-gray-800">{c.full_name} <span className="text-gray-400 font-normal">({c.relationship})</span></p>
                    <p className="text-sm text-gray-600">{c.phone}{c.phone2?` · ${c.phone2}`:''}</p>
                    {c.address && <p className="text-xs text-gray-400">{c.address}</p>}
                  </div>
                ))}
              </Section>
            )}

            {emp.educationRecords?.length > 0 && (
              <Section icon={BookOpen} title="Education">
                {emp.educationRecords.map(e=>(
                  <div key={e.id} className="mb-3 pl-3 border-l-2 border-green-200">
                    <p className="text-sm font-semibold text-gray-800">{e.qualification} — {e.field_of_study}</p>
                    <p className="text-sm text-gray-600">{e.institution}</p>
                    <p className="text-xs text-gray-400">{e.year_from}–{e.year_to}{e.grade?` · ${e.grade}`:''}{e.honours?` · ${e.honours}`:''}</p>
                  </div>
                ))}
              </Section>
            )}

            {emp.workHistory?.length > 0 && (
              <Section icon={Briefcase} title="Work History">
                {emp.workHistory.map(w=>(
                  <div key={w.id} className="mb-3 pl-3 border-l-2 border-purple-200">
                    <p className="text-sm font-semibold text-gray-800">{w.title}</p>
                    <p className="text-sm text-gray-600">{w.organisation}</p>
                    <p className="text-xs text-gray-400">{w.period_from} – {w.period_to}{w.supervisor_name?` · Supervisor: ${w.supervisor_name}`:''}</p>
                  </div>
                ))}
              </Section>
            )}

            {emp.referees?.length > 0 && (
              <Section icon={Users} title="Referees">
                {emp.referees.map(r=>(
                  <div key={r.id} className="mb-3 pl-3 border-l-2 border-orange-200">
                    <p className="text-sm font-semibold text-gray-800">{r.name}{r.title?` — ${r.title}`:''}</p>
                    {r.phone && <p className="text-sm text-gray-600">{r.phone}</p>}
                    {r.email && <p className="text-sm text-gray-500">{r.email}</p>}
                    {r.address && <p className="text-xs text-gray-400">{r.address}</p>}
                  </div>
                ))}
              </Section>
            )}

            {emp.documents?.length > 0 && (
              <Section icon={FileText} title="Uploaded Documents">
                <div className="space-y-2">
                  {emp.documents.map(d=>(
                    <div key={d.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-gray-400 shrink-0"/>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{d.title}</p>
                          <p className="text-xs text-gray-400">{d.category} · {fmtBytes(d.file_size_bytes)}</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => openDocument(d.id)}
                        className="shrink-0 text-blue-600 hover:text-blue-800 text-xs font-medium flex items-center gap-1 ml-3">
                        Open <ChevronRight className="w-3 h-3"/>
                      </button>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>)}
        </div>

        {/* ── Footer ── */}
        <div className="border-t bg-gray-50 px-6 py-4 shrink-0">
          {toast && (
            <div className={`mb-3 px-4 py-2 rounded-lg text-sm text-white flex items-center gap-2 ${toast.ok?'bg-green-600':'bg-red-600'}`}>
              {toast.ok ? <CheckCircle2 className="w-4 h-4"/> : <XCircle className="w-4 h-4"/>}
              {toast.msg}
            </div>
          )}
          {!showReject ? (
            <div className="space-y-3">
              {/* Job assignment on approval */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Assign Position (optional)</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Job title / designation"
                    value={jobTitle}
                    onChange={e => setJobTitle(e.target.value)}
                    className="flex-1 text-sm border border-blue-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  />
                  <select
                    value={contractType}
                    onChange={e => setContractType(e.target.value)}
                    className="text-sm border border-blue-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  >
                    <option value="permanent">Permanent</option>
                    <option value="contract">Contract</option>
                    <option value="probation">Probation</option>
                    <option value="casual">Casual</option>
                    <option value="internship">Internship</option>
                  </select>
                </div>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  title="Start date (defaults to today)"
                  className="w-full text-sm border border-blue-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                />
                <p className="text-xs text-blue-500">If filled, an employment record will be created at {emp?.campus_name ?? 'the assigned station'}.</p>
              </div>
              <div className="flex gap-3">
                <button disabled={!!busy||loading} onClick={doApprove}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
                  <CheckCircle2 className="w-4 h-4"/>{busy==='approve'?'Approving…':'Approve & Activate'}
                </button>
                <button disabled={!!busy||loading} onClick={()=>setShowReject(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white border border-red-300 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 disabled:opacity-50">
                  <XCircle className="w-4 h-4"/>Reject
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-red-700 mb-2">Reason for rejection (optional)</p>
              <textarea rows={2} value={reason} onChange={e=>setReason(e.target.value)}
                placeholder="e.g. Incomplete documents, duplicate entry…"
                className="w-full text-sm border border-red-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400 bg-white resize-none"/>
              <div className="mt-2 flex gap-2">
                <button disabled={busy==='reject'} onClick={doReject}
                  className="flex-1 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50">
                  {busy==='reject'?'Rejecting…':'Confirm Reject'}
                </button>
                <button onClick={()=>{setShowReject(false);setReason('');}} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

interface PendingEmployee {
  id: string;
  staff_no: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  phone: string;
  email: string | null;
  national_id: string | null;
  gender: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  residential_address: string | null;
  created_at: string;
  campus_id: string | null;
  campus_name: string | null;
}

export default function PendingApprovalsPage() {
  const [rows, setRows]         = useState<PendingEmployee[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string|null>(null);
  const [reviewId, setReviewId] = useState<string|null>(null);
  const [toast, setToast]       = useState<{msg:string;ok:boolean}|null>(null);

  const flash = (msg: string, ok=true) => { setToast({msg,ok}); setTimeout(()=>setToast(null),3500); };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows((await apiOnboardingPendingList()) as PendingEmployee[]); }
    catch(e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg"><ClipboardCheck className="w-6 h-6 text-amber-600"/></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pending Approvals</h1>
            <p className="text-sm text-gray-500">Click <strong>Review</strong> to see full details before approving or rejecting</p>
          </div>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/>Refresh
        </button>
      </div>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm flex items-center gap-2 ${toast.ok?'bg-green-600':'bg-red-600'}`}>
          {toast.ok?<CheckCircle2 className="w-4 h-4"/>:<XCircle className="w-4 h-4"/>}{toast.msg}
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3"/>
          <p className="text-gray-700 font-medium">No pending submissions</p>
          <p className="text-sm text-gray-400 mt-1">All onboarding submissions have been reviewed.</p>
        </div>
      )}

      {rows.length > 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          <strong>{rows.length}</strong> submission{rows.length!==1?'s':''} waiting for review
        </p>
      )}

      <div className="space-y-3">
        {rows.map(row => (
          <div key={row.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="shrink-0 w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-base">
              {row.first_name[0]}{row.last_name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gray-900">{fullName(row)}</span>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending</span>
                {row.campus_name && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Briefcase className="w-3 h-3"/>{row.campus_name}
                  </span>
                )}
                <span className="text-xs text-gray-400">{row.staff_no}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-500">
                {row.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5"/>{row.phone}</span>}
                {row.email && <span className="flex items-center gap-1 truncate max-w-xs"><Mail className="w-3.5 h-3.5 shrink-0"/>{row.email}</span>}
                {row.national_id && <span className="flex items-center gap-1"><User className="w-3.5 h-3.5"/>NID: {row.national_id}</span>}
                {row.nationality && <span>{row.nationality}</span>}
              </div>
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                <Calendar className="w-3 h-3"/>Submitted {fmtDate(row.created_at)}
                {row.residential_address && <><MapPin className="w-3 h-3 ml-2"/>{row.residential_address}</>}
              </p>
            </div>
            <button onClick={()=>setReviewId(row.id)}
              className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
              <Eye className="w-4 h-4"/>Review
            </button>
          </div>
        ))}
      </div>

      {reviewId && (
        <ReviewDrawer
          empId={reviewId}
          onClose={()=>setReviewId(null)}
          onApproved={id=>{ setRows(p=>p.filter(r=>r.id!==id)); flash('Employee approved and activated.'); }}
          onRejected={id=>{ setRows(p=>p.filter(r=>r.id!==id)); flash('Submission rejected.', false); }}
        />
      )}
    </div>
  );
}
