import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, User, Briefcase, ArrowLeftRight, BarChart2, BookOpen, FileText, Pencil, Trash2, Upload, Eye, Download, GraduationCap, Camera, CreditCard, CheckCircle2, AlertCircle, Printer, Plus, LogOut, RefreshCw, ScanLine, Video, Maximize2, X, CalendarDays } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { isElectron } from '../lib/api';
import { formatDate, yearsFrom } from '@sak/shared';
import StaffAppraisalForm from '../components/StaffAppraisalForm';
import AppraisalPrintReport from '../components/AppraisalPrintReport';
import { escapeHtml, writePrintDocument } from '../lib/printWindow';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string) || '';
const API_ROOT = import.meta.env.DEV ? '' : SERVER_URL;

/**
 * Fetch a document as a blob URL (auth-aware). Auto-revokes on unmount.
 *
 * In the desktop build the session token is held by the main process, so the
 * bytes come back over IPC; in the browser build we call the API directly with
 * the token from storage. Either way the file is permission-checked server-side.
 */
function useDocumentBlob(docId: string | undefined) {
  const [url, setUrl] = React.useState<string | null>(null);
  useEffect(() => {
    if (!docId) { setUrl(null); return; }
    let active = true;

    const load = async (): Promise<Blob | null> => {
      if (isElectron()) {
        const res = await window.sakAPI.documents.file(docId);
        if (!res?.ok || !res.data) return null;
        return new Blob([new Uint8Array(res.data)], { type: res.mimeType ?? 'application/octet-stream' });
      }
      const token = localStorage.getItem('sak_token');
      const res = await fetch(`${API_ROOT}/api/documents/${docId}/file`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      return res.ok ? res.blob() : null;
    };

    load()
      .then((blob) => { if (active && blob) setUrl(URL.createObjectURL(blob)); })
      .catch(() => {});
    return () => { active = false; };
  }, [docId]);
  useEffect(() => {
    return () => { if (url) URL.revokeObjectURL(url); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return url;
}

type Tab = 'profile' | 'employment' | 'transfers' | 'performance' | 'training' | 'attendance' | 'documents';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'profile',    label: 'Profile',     icon: User },
  { key: 'employment', label: 'Employment',  icon: Briefcase },
  { key: 'transfers',  label: 'Transfers',   icon: ArrowLeftRight },
  { key: 'performance',label: 'Performance', icon: BarChart2 },
  { key: 'training',    label: 'Training',    icon: BookOpen },
  { key: 'attendance',  label: 'Attendance',  icon: CalendarDays },
  { key: 'documents',   label: 'Documents',   icon: FileText },
];

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<Tab>('profile');
  const [showPrint, setShowPrint] = React.useState(false);
  const [showDeactivate, setShowDeactivate] = React.useState(false);
  const { hasPermission } = useAuthStore();

  const { data: employee, isLoading } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => window.sakAPI.employees.get(id!),
    enabled: !!id,
  });

  const deactivateMut = useMutation({
    mutationFn: (payload: { exitReason: string; exitDate: string; exitNotes?: string }) =>
      window.sakAPI.employees.deactivate(id!, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employee', id] }); setShowDeactivate(false); },
  });

  const reactivateMut = useMutation({
    mutationFn: () => window.sakAPI.employees.reactivate(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee', id] }),
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
        {hasPermission('staff_profiles', 'update') && (
          emp.is_active ? (
            <button
              onClick={() => setShowDeactivate(true)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-red-500 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
              title="Deactivate / Exit Staff"
            >
              <LogOut size={13} /> Exit
            </button>
          ) : (
            <button
              onClick={() => reactivateMut.mutate()}
              disabled={reactivateMut.isPending}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
              title="Reactivate staff"
            >
              <RefreshCw size={13} /> Reactivate
            </button>
          )
        )}
        <button
          onClick={() => setShowPrint(true)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
        >
          <Printer size={13} /> Print
        </button>
      </div>

      {showPrint && <PrintProfileModal emp={emp} onClose={() => setShowPrint(false)} />}
      {showDeactivate && <DeactivateModal emp={emp} onClose={() => setShowDeactivate(false)} onConfirm={(p) => deactivateMut.mutate(p)} isPending={deactivateMut.isPending} error={deactivateMut.error as Error | null} />}

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
        {activeTab === 'attendance' && <AttendanceTab employeeId={emp.id} />}
        {activeTab === 'documents' && <DocumentsTab employeeId={emp.id} />}
      </div>
    </div>
  );
}

// ── Sub-tabs ─────────────────────────────────────────────────────────────────

type EmpShape = {
  id: string; staff_no: string; first_name: string; middle_name?: string; last_name: string;
  gender: string; date_of_birth: string; nationality: string; national_id?: string;
  passport_no?: string; blood_group?: string; tribe?: string;
  phone: string; phone2?: string; whatsapp_phone?: string; email?: string; residential_address?: string;
  marital_status?: string; religion?: string; is_active: boolean;
  // Gov / Payroll identifiers
  tin?: string; nssf_number?: string;
  // Skills / Teaching
  subjects_of_preference?: string; other_skills?: string;
  // Appointment
  date_appointed?: string; type_of_work?: string;
  // Family
  spouse_name?: string; spouse_phone?: string; no_of_children?: number;
  // Residence
  current_zone?: string; landlord_name?: string; parents_names?: string;
  village?: string; village_zone?: string; village_direction?: string;
  // Free-text
  other_job_interests?: string; earlier_responsibilities?: string;
  special_courses?: string; medical_background?: string; other_information?: string;
  // Related lists
  emergencyContacts?: { id: string; full_name: string; relationship: string; phone: string; address?: string }[];
  education?: { id: string; institution: string; qualification: string; field_of_study?: string; year_from: number; year_to: number; grade?: string; honours?: string }[];
  workHistory?: { id: string; period_from: string; period_to: string; organisation: string; title: string; supervisor_name?: string }[];
  referees?: { id: string; ref_order: number; name: string; title?: string; phone?: string; email?: string; address?: string }[];
};

// ── Print Profile Modal ───────────────────────────────────────────────────────

function PrintProfileModal({ emp, onClose }: { emp: EmpShape; onClose: () => void }) {
  const { data: empRecords = [] } = useQuery({
    queryKey: ['employment', emp.id],
    queryFn: () => window.sakAPI.employment.getByEmployee(emp.id),
  });
  const { data: transfers = [] } = useQuery({
    queryKey: ['transfers', emp.id],
    queryFn: () => window.sakAPI.transfers.list({ employeeId: emp.id }),
  });
  const { data: performance = [] } = useQuery({
    queryKey: ['performance', emp.id],
    queryFn: () => window.sakAPI.performance.list({ employeeId: emp.id }),
  });
  const { data: training = [] } = useQuery({
    queryKey: ['training', emp.id],
    queryFn: () => window.sakAPI.training.list({ employeeId: emp.id }),
  });

  const employment = empRecords as { id: string; job_title: string; contract_type: string; status: string; start_date: string; campus_name: string; department_name: string; pay_grade?: string; salaryHistory?: { amount: number; currency: string; effective_date: string }[] }[];
  const txfers     = transfers  as { id: string; type: string; status: string; from_campus_name: string; to_campus_name: string; effective_date: string; reason: string }[];
  const appraisals = performance as { id: string; period: string; academic_year: string; overall_score: number; overall_rating: string; conducted_date: string }[];
  const trainings  = training   as { id: string; title: string; provider: string; type: string; start_date: string; duration_days: number }[];

  const latestEmp = employment.find(e => e.status === 'active') ?? employment[0];

  const doPrint = () => {
    const fullName = [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(' ');
    const printDate = new Date().toLocaleDateString('en-UG', { day: '2-digit', month: 'long', year: 'numeric' });

    const row = (label: string, value: string | undefined) =>
      `<tr><td class="lbl">${label}</td><td class="val">${escapeHtml(value) || '—'}</td></tr>`;

    const section = (title: string, content: string) =>
      `<div class="section"><h2>${title}</h2>${content}</div>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Staff Profile — ${escapeHtml(fullName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #111; background: #fff; }
  .page { padding: 20mm 18mm; }

  /* Header */
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2.5px solid #1e40af; padding-bottom: 10px; margin-bottom: 14px; }
  .header-left { display: flex; align-items: center; gap: 14px; }
  .logo { width: 52px; height: 52px; border-radius: 8px; object-fit: cover; }
  .org-name { font-size: 13pt; font-weight: 700; color: #1e40af; }
  .org-sub  { font-size: 9pt; color: #555; margin-top: 2px; }
  .print-date { font-size: 8.5pt; color: #777; text-align: right; }

  /* Staff banner */
  .banner { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 16px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; }
  .banner-name { font-size: 15pt; font-weight: 700; color: #1e3a8a; }
  .banner-sub  { font-size: 10pt; color: #2563eb; font-family: monospace; margin-top: 3px; }
  .banner-meta { font-size: 9.5pt; color: #555; margin-top: 3px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 8.5pt; font-weight: 600; }
  .badge-active   { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
  .badge-inactive { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }

  /* Sections */
  .section { margin-bottom: 14px; page-break-inside: avoid; }
  .section h2 { font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #1e40af; border-bottom: 1px solid #bfdbfe; padding-bottom: 4px; margin-bottom: 8px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; }
  table tr { border-bottom: 1px solid #e5e7eb; }
  table tr:last-child { border-bottom: none; }
  td { padding: 4px 4px; vertical-align: top; }
  td.lbl { color: #6b7280; width: 38%; white-space: nowrap; }
  td.val { font-weight: 500; color: #111; text-transform: capitalize; }

  /* Record cards */
  .record { border: 1px solid #e5e7eb; border-radius: 6px; padding: 9px 12px; margin-bottom: 8px; page-break-inside: avoid; }
  .record-title { font-weight: 700; font-size: 10.5pt; color: #111; }
  .record-sub   { font-size: 9.5pt; color: #555; margin-top: 2px; }
  .record-meta  { font-size: 9pt; color: #777; margin-top: 3px; }
  .score { font-size: 14pt; font-weight: 700; color: #1e40af; }

  /* Footer */
  .footer { margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 8px; display: flex; justify-content: space-between; font-size: 8.5pt; color: #9ca3af; }

  .empty { font-size: 9.5pt; color: #9ca3af; font-style: italic; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-break { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <img class="logo" src="/sak.jpg" onerror="this.style.display='none'" />
      <div>
        <div class="org-name">Sir Apollo Kaggwa Schools</div>
        <div class="org-sub">Staff Profile Report</div>
      </div>
    </div>
    <div class="print-date">Printed: ${escapeHtml(printDate)}</div>
  </div>

  <!-- Staff banner -->
  <div class="banner">
    <div>
      <div class="banner-name">${escapeHtml(fullName)}</div>
      <div class="banner-sub">${escapeHtml(emp.staff_no)}</div>
      ${latestEmp ? `<div class="banner-meta">${escapeHtml(latestEmp.job_title)} &nbsp;·&nbsp; ${escapeHtml(latestEmp.campus_name)} &nbsp;·&nbsp; ${escapeHtml(latestEmp.department_name)}</div>` : ''}
    </div>
    <span class="badge badge-${emp.is_active ? 'active' : 'inactive'}">${emp.is_active ? 'Active' : 'Inactive'}</span>
  </div>

  <!-- Personal + Contact (two columns) -->
  <div class="two-col">
    ${section('Personal Information', `<table>
      ${row('Gender', emp.gender)}
      ${row('Date of Birth', emp.date_of_birth ? formatDate(emp.date_of_birth) : undefined)}
      ${row('Age', emp.date_of_birth ? yearsFrom(emp.date_of_birth) + ' years' : undefined)}
      ${row('Nationality', emp.nationality)}
      ${row('National ID', emp.national_id)}
      ${row('Passport No', emp.passport_no)}
      ${row('Blood Group', emp.blood_group)}
      ${row('Tribe', emp.tribe)}
      ${row('Marital Status', emp.marital_status)}
      ${row('Religion', emp.religion)}
      ${emp.marital_status === 'married' ? row('Spouse', emp.spouse_name) : ''}
      ${emp.marital_status === 'married' ? row('Children', emp.no_of_children != null ? String(emp.no_of_children) : undefined) : ''}
    </table>`)}
    ${section('Contact Details', `<table>
      ${row('Phone', emp.phone)}
      ${row('Phone 2', emp.phone2)}
      ${row('WhatsApp', emp.whatsapp_phone)}
      ${row('Email', emp.email)}
      ${row('Address', emp.residential_address)}
    </table>`)}
  </div>

  ${(emp.date_appointed || emp.type_of_work) ? section('Appointment', `<table>
    ${row('Date Appointed', emp.date_appointed ? formatDate(emp.date_appointed) : undefined)}
    ${row('Type of Work', emp.type_of_work)}
  </table>`) : ''}

  <!-- Employment -->
  ${section('Employment History', employment.length === 0
    ? '<p class="empty">No employment records found.</p>'
    : employment.map(e => `
      <div class="record no-break">
        <div class="record-title">${escapeHtml(e.job_title)}</div>
        <div class="record-sub">${escapeHtml(e.campus_name)} &nbsp;·&nbsp; ${escapeHtml(e.department_name)}</div>
        <div class="record-meta">
          Contract: ${escapeHtml(e.contract_type)} &nbsp;·&nbsp; Start: ${formatDate(e.start_date)} &nbsp;·&nbsp; Status: ${escapeHtml(e.status)}
          ${e.pay_grade ? ' &nbsp;·&nbsp; Grade: ' + escapeHtml(e.pay_grade) : ''}
          ${e.salaryHistory?.length ? ' &nbsp;·&nbsp; Salary: ' + e.salaryHistory[0].currency + ' ' + Number(e.salaryHistory[0].amount).toLocaleString() : ''}
        </div>
      </div>`).join('')
  )}

  <!-- Academic / Education -->
  ${section('Academic / Education', (!emp.education || emp.education.length === 0)
    ? '<p class="empty">No academic records found.</p>'
    : emp.education.map(e => `
      <div class="record no-break">
        <div class="record-title">${escapeHtml(e.qualification)}</div>
        <div class="record-sub">${escapeHtml(e.institution)}${e.field_of_study ? ' &nbsp;·&nbsp; ' + escapeHtml(e.field_of_study) : ''}</div>
        <div class="record-meta">${escapeHtml(e.year_from)} – ${escapeHtml(e.year_to)}${e.grade ? ' &nbsp;·&nbsp; ' + escapeHtml(e.grade) : ''}${e.honours ? ' &nbsp;·&nbsp; ' + escapeHtml(e.honours) : ''}</div>
      </div>`).join('')
  )}

  <!-- Previous Work History -->
  ${emp.workHistory?.length ? section('Previous Employment History', emp.workHistory.map(w => `
    <div class="record no-break">
      <div class="record-title">${escapeHtml(w.title)}</div>
      <div class="record-sub">${escapeHtml(w.organisation)}</div>
      <div class="record-meta">${escapeHtml(w.period_from)} – ${escapeHtml(w.period_to)}${w.supervisor_name ? ' &nbsp;·&nbsp; Supervisor: ' + escapeHtml(w.supervisor_name) : ''}</div>
    </div>`).join('')
  ) : ''}

  <!-- Referees -->
  ${emp.referees?.length ? section('Referees', `<table>
    <tr style="background:#f9fafb"><td class="lbl"><b>Name</b></td><td class="lbl"><b>Title</b></td><td class="lbl"><b>Phone</b></td><td class="lbl"><b>Email</b></td></tr>
    ${emp.referees.map(r => `<tr><td class="val">${escapeHtml(r.name)}</td><td class="val">${escapeHtml(r.title) || '—'}</td><td class="val">${escapeHtml(r.phone) || '—'}</td><td class="val">${escapeHtml(r.email) || '—'}</td></tr>`).join('')}
  </table>`) : ''}

  <!-- Transfers -->
  ${txfers.length > 0 ? section('Transfer / Deployment History', txfers.map(t => `
    <div class="record no-break">
      <div class="record-title" style="text-transform:capitalize">${escapeHtml(t.type)}</div>
      <div class="record-sub">${escapeHtml(t.from_campus_name)} → ${escapeHtml(t.to_campus_name)}</div>
      <div class="record-meta">Effective: ${formatDate(t.effective_date)} &nbsp;·&nbsp; Status: ${escapeHtml(t.status)}</div>
      ${t.reason ? `<div class="record-meta">${escapeHtml(t.reason)}</div>` : ''}
    </div>`).join('')
  ) : ''}

  <!-- Performance -->
  ${appraisals.length > 0 ? section('Performance Appraisals', appraisals.map(a => `
    <div class="record no-break" style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div class="record-title" style="text-transform:capitalize">${escapeHtml(a.period.replace('_', ' '))} — ${escapeHtml(a.academic_year)}</div>
        <div class="record-sub">${formatDate(a.conducted_date)} &nbsp;·&nbsp; ${escapeHtml(a.overall_rating)}</div>
      </div>
      <div class="score">${Number(a.overall_score).toFixed(1)}<span style="font-size:9pt;font-weight:400;color:#555">/5</span></div>
    </div>`).join('')
  ) : ''}

  <!-- Training -->
  ${trainings.length > 0 ? section('Training & Development', trainings.map(t => `
    <div class="record no-break">
      <div class="record-title">${escapeHtml(t.title)}</div>
      <div class="record-sub">${escapeHtml(t.provider)} &nbsp;·&nbsp; <span style="text-transform:capitalize">${escapeHtml(t.type)}</span></div>
      <div class="record-meta">${formatDate(t.start_date)} &nbsp;·&nbsp; ${escapeHtml(t.duration_days)} day(s)</div>
    </div>`).join('')
  ) : ''}

  <!-- Residence -->
  ${(emp.current_zone || emp.village || emp.landlord_name) ? section('Residence & Village', `<table>
    ${row('Current Zone', emp.current_zone)}
    ${row('Landlord', emp.landlord_name)}
    ${row('Village', emp.village)}
    ${row('Village Zone', emp.village_zone)}
    ${row('Parents\' Names', emp.parents_names)}
    ${row('Directions', emp.village_direction)}
  </table>`) : ''}

  <!-- Emergency / Next of Kin -->
  ${emp.emergencyContacts?.length ? section('Next of Kin / Emergency Contact', `<table>
    <tr style="background:#f9fafb"><td class="lbl"><b>Name</b></td><td class="lbl"><b>Relationship</b></td><td class="lbl"><b>Phone</b></td><td class="lbl"><b>Address</b></td></tr>
    ${emp.emergencyContacts.map(c => `<tr><td class="val">${escapeHtml(c.full_name)}</td><td class="val" style="text-transform:capitalize">${escapeHtml(c.relationship)}</td><td class="val">${escapeHtml(c.phone)}</td><td class="val">${escapeHtml(c.address) || '—'}</td></tr>`).join('')}
  </table>`) : ''}

  ${(emp.medical_background || emp.other_job_interests || emp.special_courses || emp.other_information) ? section('Other Information & Medical', `
    ${emp.other_job_interests ? `<p style="margin-bottom:6px"><b>Job Interests:</b> ${escapeHtml(emp.other_job_interests)}</p>` : ''}
    ${emp.special_courses ? `<p style="margin-bottom:6px"><b>Special Courses / Seminars:</b> ${escapeHtml(emp.special_courses)}</p>` : ''}
    ${emp.medical_background ? `<p style="margin-bottom:6px"><b>Medical Background:</b> ${escapeHtml(emp.medical_background)}</p>` : ''}
    ${emp.other_information ? `<p><b>Other:</b> ${escapeHtml(emp.other_information)}</p>` : ''}
  `) : ''}

  <!-- Footer -->
  <div class="footer">
    <span>${escapeHtml(fullName)} &nbsp;·&nbsp; ${escapeHtml(emp.staff_no)}</span>
    <span>Sir Apollo Kaggwa Schools &nbsp;·&nbsp; Confidential Staff Record</span>
    <span>Page 1</span>
  </div>

</div>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('Allow pop-ups for this site to print.'); return; }
    writePrintDocument(win, html);
    win.focus();
    // Small delay so images load before print dialog opens
    setTimeout(() => { win.print(); }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Printer size={16} className="text-brand-400" />
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Print Staff Profile</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-500">
            A print-ready report will be generated for:
          </p>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-1">
            <p className="font-semibold text-slate-800 dark:text-slate-100">
              {emp.first_name} {emp.middle_name ? `${emp.middle_name} ` : ''}{emp.last_name}
            </p>
            <p className="text-xs font-mono text-brand-400">{emp.staff_no}</p>
            {latestEmp && <p className="text-xs text-slate-500">{latestEmp.job_title} · {latestEmp.campus_name}</p>}
          </div>
          <p className="text-xs text-slate-400">
            Includes: personal details, contact, employment history, academic records, transfers, performance appraisals, training, and emergency contacts.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary text-sm" onClick={onClose}>Cancel</button>
            <button className="btn-primary text-sm flex items-center gap-2" onClick={() => { doPrint(); onClose(); }}>
              <Printer size={14} /> Print / Save as PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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

  const { data: bankRows = [] } = useQuery({
    queryKey: ['bank-details', emp.id],
    queryFn: () => window.sakAPI.employees.getBankDetails(emp.id),
    staleTime: 60_000,
  });
  const bankDetails = bankRows as { id: string; bank_name: string; account_name: string; account_number: string; branch?: string; is_primary: boolean }[];

  const { data: classRows = [] } = useQuery({
    queryKey: ['employee-classes', emp.id],
    queryFn: () => window.sakAPI.employees.getClasses(emp.id),
    staleTime: 60_000,
  });
  const assignedClasses = classRows as { id: string; name: string; level: string }[];

  const { data: allClassRows = [] } = useQuery({
    queryKey: ['all-classes'],
    queryFn: () => window.sakAPI.classes.list(),
    staleTime: 5 * 60_000,
  });
  const allClasses = allClassRows as { id: string; name: string; level: string; campus_name?: string }[];

  const qc = useQueryClient();
  const [editingTeaching, setEditingTeaching] = React.useState(false);
  const [tSubjects, setTSubjects] = React.useState('');
  const [tClassIds, setTClassIds] = React.useState<Set<string>>(new Set());
  const [tSaving, setTSaving]     = React.useState(false);

  function openTeachingEdit() {
    setTSubjects(emp.subjects_of_preference ?? '');
    setTClassIds(new Set(assignedClasses.map(c => c.id)));
    setEditingTeaching(true);
  }

  async function saveTeaching() {
    setTSaving(true);
    try {
      await window.sakAPI.employees.update(emp.id, { subjectsOfPreference: tSubjects || null });
      await window.sakAPI.employees.updateClasses(emp.id, Array.from(tClassIds));
      qc.invalidateQueries({ queryKey: ['employee', emp.id] });
      qc.invalidateQueries({ queryKey: ['employee-classes', emp.id] });
      setEditingTeaching(false);
    } finally { setTSaving(false); }
  }

  function toggleClass(id: string) {
    setTClassIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

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
            ['Tribe', emp.tribe ?? '–'],
            ['Religion', emp.religion ?? '–'],
            ['National ID', emp.national_id ?? '–'],
            ['Passport No', emp.passport_no ?? '–'],
            ['Blood Group', emp.blood_group ?? '–'],
            ['Marital Status', emp.marital_status ?? '–'],
            ...(emp.marital_status === 'married' ? [
              ['Spouse Name', emp.spouse_name ?? '–'] as [string,string],
              ['No. of Children', emp.no_of_children != null ? String(emp.no_of_children) : '–'] as [string,string],
            ] : []),
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
              ['WhatsApp', emp.whatsapp_phone ?? '–'],
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
                    {e.grade && <p className="text-xs text-emerald-500 dark:text-emerald-400">{e.grade}{e.honours ? ` · ${e.honours}` : ''}</p>}
                  </div>
                  <span className="text-slate-400 text-xs shrink-0">{e.year_from}–{e.year_to}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Appointment */}
        {(emp.date_appointed || emp.type_of_work) && (
          <div className="card md:col-span-2">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">Appointment</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {emp.date_appointed && (
                <><span className="text-slate-400">Date Appointed</span><span className="text-slate-800 dark:text-slate-100">{formatDate(emp.date_appointed)}</span></>
              )}
              {emp.type_of_work && (
                <><span className="text-slate-400">Type of Work</span><span className="text-slate-800 dark:text-slate-100">{emp.type_of_work}</span></>
              )}
              {emp.date_appointed && (() => {
                const ms = Date.now() - new Date(emp.date_appointed).getTime();
                const totalMonths = Math.floor(ms / (1000 * 60 * 60 * 24 * 30.44));
                const years  = Math.floor(totalMonths / 12);
                const months = totalMonths % 12;
                const label  = [
                  years  > 0 && `${years} yr${years  !== 1 ? 's' : ''}`,
                  months > 0 && `${months} mo${months !== 1 ? 's' : ''}`,
                ].filter(Boolean).join(' ');
                return label ? (
                  <><span className="text-slate-400">Years of Service</span>
                  <span className="font-semibold text-brand-600 dark:text-brand-400">{label}</span></>
                ) : null;
              })()}
            </div>
          </div>
        )}

        {/* Work History */}
        {!!emp.workHistory?.length && (
          <div className="card md:col-span-2">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
              <Briefcase size={14} /> Previous Employment History
            </h3>
            <div className="space-y-3">
              {emp.workHistory.map((w) => (
                <div key={w.id} className="flex justify-between gap-4 text-sm border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="text-slate-800 dark:text-slate-100 font-medium">{w.title}</p>
                    <p className="text-slate-500">{w.organisation}</p>
                    {w.supervisor_name && <p className="text-xs text-slate-400">Supervisor: {w.supervisor_name}</p>}
                  </div>
                  <span className="text-slate-400 text-xs shrink-0">{w.period_from} – {w.period_to}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Referees */}
        {!!emp.referees?.length && (
          <div className="card md:col-span-2">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">Referees</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {emp.referees.map((r) => (
                <div key={r.id} className="space-y-1 text-sm">
                  <p className="font-medium text-slate-800 dark:text-slate-100">{r.name}</p>
                  {r.title && <p className="text-slate-500">{r.title}</p>}
                  {r.phone && <p className="text-brand-400">{r.phone}</p>}
                  {r.email && <p className="text-slate-400">{r.email}</p>}
                  {r.address && <p className="text-slate-400 text-xs">{r.address}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Residence */}
        {(emp.current_zone || emp.village || emp.landlord_name || emp.parents_names) && (
          <div className="card md:col-span-2">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">Residence &amp; Village Details</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {[['Current Zone', emp.current_zone],['Landlord', emp.landlord_name],
                ['Village', emp.village],['Village Zone', emp.village_zone],
                ['Parents\' Names', emp.parents_names],['Directions to Village', emp.village_direction]
              ].filter(([,v]) => v).map(([label, value]) => (
                <React.Fragment key={label as string}>
                  <span className="text-slate-400">{label}</span>
                  <span className="text-slate-800 dark:text-slate-100">{value}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Emergency Contacts / Next of Kin */}
        {emp.emergencyContacts?.length ? (
          <div className="card md:col-span-2">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">Next of Kin / Emergency Contact</h3>
            <div className="space-y-2">
              {emp.emergencyContacts.map((c) => (
                <div key={c.id} className="flex justify-between text-sm">
                  <div>
                    <p className="text-slate-800 dark:text-slate-100">{c.full_name}</p>
                    <p className="text-slate-400 capitalize">{c.relationship}</p>
                    {c.address && <p className="text-slate-400 text-xs">{c.address}</p>}
                  </div>
                  <span className="text-brand-400">{c.phone}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Other / Medical */}
        {(emp.other_job_interests || emp.earlier_responsibilities || emp.special_courses || emp.medical_background || emp.other_information) && (
          <div className="card md:col-span-2 space-y-4">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Other Information &amp; Medical</h3>
            {[
              ['Other Job Interests', emp.other_job_interests],
              ['Earlier Responsibilities', emp.earlier_responsibilities],
              ['Special Courses / Seminars', emp.special_courses],
              ['Medical Background', emp.medical_background],
              ['Other Information', emp.other_information],
            ].filter(([,v]) => v).map(([label, value]) => (
              <div key={label as string}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Government IDs & Payroll */}
        <div className="card md:col-span-2">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
            <CreditCard size={14} /> Government IDs &amp; Payroll
          </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {emp.tin && (
                <>
                  <span className="text-slate-400">TIN (Tax ID)</span>
                  <span className="text-slate-800 dark:text-slate-100 font-mono">{emp.tin}</span>
                </>
              )}
              {emp.nssf_number && (
                <>
                  <span className="text-slate-400">NSSF Number</span>
                  <span className="text-slate-800 dark:text-slate-100 font-mono">{emp.nssf_number}</span>
                </>
              )}
            </div>
          {bankDetails.length > 0 ? (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Bank Account(s)</p>
              {bankDetails.map((b) => (
                <div key={b.id} className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{b.bank_name}</span>
                    {b.is_primary && <span className="badge-active text-xs">Primary</span>}
                  </div>
                  <p className="text-slate-500">{b.account_name}</p>
                  <p className="font-mono text-brand-400">{b.account_number}</p>
                  {b.branch && <p className="text-xs text-slate-400">Branch: {b.branch}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 mt-2 italic">No bank accounts on file</p>
          )}
        </div>

        {/* Teaching Assignment */}
        <div className="card md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <GraduationCap size={14} /> Teaching Assignment &amp; Skills
            </h3>
            {!editingTeaching && (
              <button onClick={openTeachingEdit}
                className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline">
                <Pencil size={12} /> Edit
              </button>
            )}
          </div>

          {editingTeaching ? (
            <div className="space-y-4">
              {/* Subjects textarea */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Subjects of Preference</label>
                <textarea
                  className="input resize-none text-sm"
                  rows={2}
                  value={tSubjects}
                  onChange={e => setTSubjects(e.target.value)}
                  placeholder="e.g. Mathematics, English, Biology…"
                />
              </div>

              {/* Class checkboxes grouped by level */}
              {allClasses.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Assigned Classes</label>
                  {(['kindergarten', 'primary'] as const).map(level => {
                    const group = allClasses.filter(c => c.level === level);
                    if (!group.length) return null;
                    return (
                      <div key={level} className="mb-3">
                        <p className="text-xs text-slate-400 capitalize mb-1.5">{level}</p>
                        <div className="flex flex-wrap gap-2">
                          {group.map(c => (
                            <label key={c.id}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer border transition-colors select-none ${
                                tClassIds.has(c.id)
                                  ? 'bg-brand-500 text-white border-brand-500'
                                  : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-brand-400'
                              }`}>
                              <input type="checkbox" className="sr-only"
                                checked={tClassIds.has(c.id)}
                                onChange={() => toggleClass(c.id)} />
                              {c.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={saveTeaching} disabled={tSaving}
                  className="btn-primary text-xs px-3 py-1.5 disabled:opacity-60">
                  {tSaving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditingTeaching(false)} disabled={tSaving}
                  className="btn-secondary text-xs px-3 py-1.5">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {emp.subjects_of_preference && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Subjects</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{emp.subjects_of_preference}</p>
                </div>
              )}
              {assignedClasses.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Classes Assigned</p>
                  <div className="flex flex-wrap gap-2">
                    {assignedClasses.map((c) => (
                      <span key={c.id} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 capitalize">
                        {c.name} <span className="ml-1 text-brand-400">({c.level})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {emp.other_skills && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Other Skills</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{emp.other_skills}</p>
                </div>
              )}
              {!emp.subjects_of_preference && !emp.other_skills && assignedClasses.length === 0 && (
                <p className="text-xs text-slate-400 italic">Click <strong>Edit</strong> to assign subjects and classes.</p>
              )}
            </div>
          )}
        </div>
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
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ['employment', employeeId],
    queryFn: () => window.sakAPI.employment.getByEmployee(employeeId),
  });
  const records = data as {
    id: string; job_title: string; contract_type: string; status: string;
    start_date: string; campus_name: string; department_name: string;
    salaryHistory?: { id: string; amount: number; currency: string; effective_date: string }[];
  }[];

  const { data: campuses = [] } = useQuery<{ id: string; name: string; code: string }[]>({
    queryKey: ['campuses'],
    queryFn: () => window.sakAPI.campuses.list() as Promise<{ id: string; name: string; code: string }[]>,
  });
  const { data: allDepts = [] } = useQuery<{ id: string; name: string; campus_id: string | null }[]>({
    queryKey: ['departments'],
    queryFn: () => window.sakAPI.campuses.listDepartments() as Promise<{ id: string; name: string; campus_id: string | null }[]>,
  });
  const { data: jobTitles = [] } = useQuery<{ id: string; title: string }[]>({
    queryKey: ['job-titles'],
    queryFn: () => window.sakAPI.jobTitles.list({ active: 'true' }) as Promise<{ id: string; title: string }[]>,
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    campusId: '', departmentId: '', jobTitle: '',
    contractType: 'permanent', startDate: new Date().toISOString().slice(0, 10),
    payGrade: '', salaryAmount: '', salaryCurrency: 'UGX',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const depts = allDepts.filter((d) => !form.campusId || d.campus_id === form.campusId);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.campusId || !form.departmentId || !form.jobTitle || !form.startDate) {
      setErr('Station, department, job title and start date are required'); return;
    }
    setBusy(true); setErr('');
    try {
      const emp = await window.sakAPI.employment.create({
        employeeId, campusId: form.campusId, departmentId: form.departmentId,
        jobTitle: form.jobTitle, contractType: form.contractType,
        startDate: form.startDate, payGrade: form.payGrade || undefined,
      }) as any;
      if (form.salaryAmount) {
        const empId = emp?.id ?? emp?.data?.id;
        if (empId) {
          await window.sakAPI.employment.addSalary(empId, {
            amount: Number(form.salaryAmount), currency: form.salaryCurrency,
            paymentFrequency: 'monthly', effectiveDate: form.startDate,
          });
        }
      }
      qc.invalidateQueries({ queryKey: ['employment', employeeId] });
      setShowForm(false);
      setForm({ campusId: '', departmentId: '', jobTitle: '', contractType: 'permanent',
                startDate: new Date().toISOString().slice(0, 10), payGrade: '', salaryAmount: '', salaryCurrency: 'UGX' });
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? e?.message ?? 'Failed to save');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Employment Records</h3>
        <button onClick={() => { setShowForm(s => !s); setErr(''); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition-colors">
          <Plus size={12} /> Add Employment
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} className="card space-y-3 border-brand-500/40 border">
          <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide">New Employment Record</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Station / Campus *</label>
              <select className="input" value={form.campusId}
                onChange={e => setForm(f => ({ ...f, campusId: e.target.value, departmentId: '' }))}>
                <option value="">Select station…</option>
                {(campuses as { id: string; name: string }[]).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Department *</label>
              <select className="input" value={form.departmentId}
                onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))}>
                <option value="">Select department…</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Job Title *</label>
              <select className="input" value={form.jobTitle}
                onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}>
                <option value="">Select job title…</option>
                {(jobTitles as { id: string; title: string }[]).map(j => <option key={j.id} value={j.title}>{j.title}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Contract Type *</label>
              <select className="input" value={form.contractType}
                onChange={e => setForm(f => ({ ...f, contractType: e.target.value }))}>
                {['permanent','contract','probation','casual','internship'].map(t =>
                  <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Start Date *</label>
              <input className="input" type="date" value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">Pay Grade</label>
              <input className="input" placeholder="e.g. U4, P4" value={form.payGrade}
                onChange={e => setForm(f => ({ ...f, payGrade: e.target.value }))} />
            </div>
            <div>
              <label className="label">Salary Amount</label>
              <input className="input" type="number" min="0" placeholder="e.g. 850000" value={form.salaryAmount}
                onChange={e => setForm(f => ({ ...f, salaryAmount: e.target.value }))} />
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="input" value={form.salaryCurrency}
                onChange={e => setForm(f => ({ ...f, salaryCurrency: e.target.value }))}>
                <option>UGX</option><option>USD</option><option>KES</option>
              </select>
            </div>
          </div>
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary text-sm" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="btn-primary text-sm" disabled={busy}>
              {busy ? 'Saving…' : 'Save Employment'}
            </button>
          </div>
        </form>
      )}

      {/* Records list */}
      {records.length === 0 && !showForm && (
        <div className="card text-center py-8">
          <Briefcase size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 text-sm">No employment records yet.</p>
          <p className="text-xs text-slate-400 mt-1">Click <strong>Add Employment</strong> above to assign a station, department, and role.</p>
        </div>
      )}
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
  const [showForm, setShowForm] = useState(false);
  const [editAppraisalId, setEditAppraisalId] = useState<string | null>(null);
  const [printAppraisal, setPrintAppraisal] = useState<any>(null);
  const queryClient = useQueryClient();

  async function handleViewAppraisal(a: any) {
    try {
      const full = await window.sakAPI.staffAppraisals.get(a.id);
      setPrintAppraisal(full);
    } catch {
      setPrintAppraisal(a);
    }
  }

  // Load new dynamic appraisals
  const { data: staffAppraisals = [] } = useQuery({
    queryKey: ['staff-appraisals-employee', employeeId],
    queryFn: () => window.sakAPI.staffAppraisals.getByEmployee(employeeId),
  });
  const appraisals = staffAppraisals as {
    id: string; year: number; annual_average: number | null; category_label: string | null;
    terms: { term: string; term_score: number | null; category_label: string | null }[];
  }[];

  // Also load legacy appraisals for backward compatibility
  const { data: legacyData = [] } = useQuery({
    queryKey: ['performance', employeeId],
    queryFn: () => window.sakAPI.performance.list({ employeeId }),
  });
  const legacyRecords = legacyData as { id: string; period: string; academic_year: string; overall_score: number; overall_rating: string; conducted_date: string }[];

  // Latest appraisal summary
  const latest = appraisals.length ? appraisals[0] : null;

  const categoryClass = (label: string | null) =>
    label === 'ACHIEVED' ? 'bg-emerald-900/60 text-emerald-400' :
    label === 'PROMISING' ? 'bg-amber-900/60 text-amber-400' :
    label ? 'bg-red-900/60 text-red-400' : 'bg-slate-700 text-slate-400';

  return (
    <div className="space-y-4">
      {/* Header with Record Appraisal button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Staff Appraisals</h3>
        <button
          onClick={() => { setEditAppraisalId(null); setShowForm(true); }}
          className="btn btn-sm bg-brand-600 hover:bg-brand-700 text-white flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
        >
          <Plus size={14} /> Record Appraisal
        </button>
      </div>

      {/* Appraisal Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 bg-black/50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-3xl mx-4 my-8 max-h-[85vh] overflow-y-auto">
            <StaffAppraisalForm
              onClose={() => {
                setShowForm(false);
                setEditAppraisalId(null);
                queryClient.invalidateQueries({ queryKey: ['staff-appraisals-employee', employeeId] });
              }}
              editId={editAppraisalId}
              preSelectedEmployeeId={employeeId}
            />
          </div>
        </div>
      )}

      {/* Latest summary card */}
      {latest && (
        <div className="card bg-gradient-to-r from-brand-500/10 to-transparent">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 uppercase font-semibold">Latest Year ({latest.year})</p>
              <p className="text-2xl font-bold text-brand-400 mt-1">
                {latest.annual_average !== null ? `${Number(latest.annual_average).toFixed(1)}%` : '—'}
              </p>
            </div>
            <div className="text-right">
              {latest.category_label && (
                <span className={`text-xs px-3 py-1 rounded-full ${categoryClass(latest.category_label)}`}>
                  {latest.category_label}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dynamic appraisals table */}
      {appraisals.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  {['Year', 'Term I', 'Term II', 'Term III', 'Average', 'Category', ''].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {appraisals.map(a => {
                  const t1 = a.terms?.find(t => t.term === 'I');
                  const t2 = a.terms?.find(t => t.term === 'II');
                  const t3 = a.terms?.find(t => t.term === 'III');
                  return (
                    <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{a.year}</td>
                      <td className="px-4 py-2.5">{t1?.term_score != null ? <span className="text-brand-400">{Number(t1.term_score).toFixed(1)}%</span> : '—'}</td>
                      <td className="px-4 py-2.5">{t2?.term_score != null ? <span className="text-brand-400">{Number(t2.term_score).toFixed(1)}%</span> : '—'}</td>
                      <td className="px-4 py-2.5">{t3?.term_score != null ? <span className="text-brand-400">{Number(t3.term_score).toFixed(1)}%</span> : '—'}</td>
                      <td className="px-4 py-2.5 font-bold text-brand-400">{a.annual_average != null ? `${Number(a.annual_average).toFixed(1)}%` : '—'}</td>
                      <td className="px-4 py-2.5">
                        {a.category_label ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${categoryClass(a.category_label)}`}>{a.category_label}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleViewAppraisal(a)}
                            className="text-slate-400 hover:text-brand-400 p-1"
                            title="View Appraisal"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => { setEditAppraisalId(a.id); setShowForm(true); }}
                            className="text-brand-400 hover:text-brand-300 p-1"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legacy appraisals (old KPI-based system) */}
      {legacyRecords.length > 0 && (
        <>
          <h3 className="text-xs font-semibold text-slate-400 uppercase mt-4">Previous Appraisals (Legacy)</h3>
          {legacyRecords.map((r) => (
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
        </>
      )}

      {appraisals.length === 0 && legacyRecords.length === 0 && (
        <p className="text-slate-500 text-sm">No appraisal records</p>
      )}

      {/* View/Print Appraisal Report Modal */}
      {printAppraisal && (
        <AppraisalPrintReport
          appraisal={printAppraisal}
          staffList={[]}
          onClose={() => setPrintAppraisal(null)}
        />
      )}
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [showUpload, setShowUpload] = useState(false);
  const [captureMode, setCaptureMode] = useState<'file' | 'webcam' | 'scanner'>('file');
  const [form, setForm] = useState({ title: '', category: 'academic', issuedDate: '', expiryDate: '' });
  const [file, setFile]   = useState<File | null>(null);
  const [formErr, setFormErr] = useState('');
  const [webcamActive, setWebcamActive] = useState(false);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [scanners, setScanners] = useState<{ device: string; name: string }[]>([]);
  const [selectedScanner, setSelectedScanner] = useState('');
  const [scanning, setScanning] = useState(false);
  const [viewDoc, setViewDoc] = useState<{ id: string; title: string; mime_type: string } | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['documents', employeeId],
    queryFn: () => window.sakAPI.documents.list({ employeeId }),
  });
  const records = data as { id: string; title: string; category: string; mime_type: string; created_at: string; issued_date?: string; expiry_date?: string; file_size_bytes: number }[];

  // ── webcam helpers ──────────────────────────────────────────────────────
  async function startWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      setWebcamActive(true);
    } catch { setFormErr('Camera not available or permission denied'); }
  }
  function stopWebcam() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setWebcamActive(false);
  }
  function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    setCapturedDataUrl(canvas.toDataURL('image/jpeg', 0.9));
    stopWebcam();
  }

  // ── scanner helpers ─────────────────────────────────────────────────────
  async function loadScanners() {
    setFormErr('');
    const result = await window.sakAPI.documents.listScanners();
    setScanners(result.scanners);
    if (result.scanners[0]) setSelectedScanner(result.scanners[0].device);
    if (!result.scanners.length) setFormErr(result.error ?? 'No scanner detected. Is a scanner connected and SANE installed?');
  }
  async function doScan() {
    if (!form.title) { setFormErr('Please enter a document title first'); return; }
    setScanning(true); setFormErr('');
    try {
      await window.sakAPI.documents.scan({ employeeId, category: form.category, title: form.title, device: selectedScanner || undefined });
      qc.invalidateQueries({ queryKey: ['documents', employeeId] });
      resetModal();
    } catch (e: any) {
      setFormErr(e?.response?.data?.message ?? e?.message ?? 'Scan failed');
    } finally { setScanning(false); }
  }

  function resetModal() {
    setShowUpload(false);
    setForm({ title: '', category: 'academic', issuedDate: '', expiryDate: '' });
    setFile(null); setFormErr(''); setCapturedDataUrl(null);
    setCaptureMode('file'); stopWebcam();
    if (fileRef.current) fileRef.current.value = '';
  }

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('No file selected');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('employeeId', employeeId);
      fd.append('category', form.category);
      fd.append('title', form.title || file.name);
      if (form.issuedDate) fd.append('issuedDate', form.issuedDate);
      if (form.expiryDate) fd.append('expiryDate', form.expiryDate);
      return window.sakAPI.documents.upload(fd);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents', employeeId] }); resetModal(); },
    onError: (e: any) => setFormErr(e?.response?.data?.message ?? e?.message ?? 'Upload failed'),
  });

  const webcamUpload = useMutation({
    mutationFn: () => {
      if (!capturedDataUrl) throw new Error('No image captured');
      return window.sakAPI.documents.uploadBase64({
        employeeId, category: form.category,
        title: form.title || 'Webcam Capture', dataUrl: capturedDataUrl,
        issuedDate: form.issuedDate || undefined,
        expiryDate: form.expiryDate || undefined,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents', employeeId] }); resetModal(); },
    onError: (e: any) => setFormErr(e?.response?.data?.message ?? e?.message ?? 'Upload failed'),
  });

  const remove = useMutation({
    mutationFn: (docId: string) => window.sakAPI.documents.delete(docId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents', employeeId] }),
  });

  return (
    <div className="space-y-3">
      {viewDoc && <DocViewerModal doc={viewDoc} onClose={() => setViewDoc(null)} />}

      <div className="flex justify-between items-center">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{records.length} document(s)</p>
        <button className="btn-primary text-xs px-3 py-1.5" onClick={() => { setFormErr(''); setShowUpload(true); }}>
          <Upload size={13} /> Add Document
        </button>
      </div>

      {isLoading && <p className="text-slate-500 text-sm">Loading…</p>}
      {!isLoading && records.length === 0 && <p className="text-slate-500 text-sm">No documents uploaded yet</p>}
      {records.map((r) => (
        <div key={r.id} className="card flex items-center gap-3">
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
            <button
              onClick={() => setViewDoc({ id: r.id, title: r.title, mime_type: r.mime_type })}
              className="p-1.5 text-slate-400 hover:text-brand-400 transition-colors" title="View inline">
              <Maximize2 size={14} />
            </button>
            <button onClick={() => window.sakAPI.documents.openFile(r.id)}
              className="p-1.5 text-slate-400 hover:text-brand-400 transition-colors" title="Open in system viewer">
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

      {/* Add Document Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">Add Document</h2>
              <button onClick={resetModal} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
            </div>

            {/* Capture mode tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800">
              {([['file', <Upload size={13} />, 'File Upload'], ['webcam', <Video size={13} />, 'Webcam'], ['scanner', <ScanLine size={13} />, 'Scanner']] as const).map(([mode, icon, label]) => (
                <button key={mode} onClick={() => { setCaptureMode(mode); setFormErr(''); stopWebcam(); setCapturedDataUrl(null); if (mode === 'scanner') loadScanners(); }}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${captureMode === mode ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                  {icon}{label}
                </button>
              ))}
            </div>

            <div className="p-5 space-y-4">
              {/* Common fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label">Category *</label>
                  <select className="input" value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}>
                    {DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="label">Title / Description *</label>
                  <input className="input" placeholder="e.g. Bachelor of Education — Makerere 2010"
                    value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div><label className="label">Issue Date</label><input type="date" className="input" value={form.issuedDate} onChange={(e) => setForm(f => ({ ...f, issuedDate: e.target.value }))} /></div>
                <div><label className="label">Expiry Date</label><input type="date" className="input" value={form.expiryDate} onChange={(e) => setForm(f => ({ ...f, expiryDate: e.target.value }))} /></div>
              </div>

              {/* File tab */}
              {captureMode === 'file' && (
                <div>
                  <label className="label">File *</label>
                  <input ref={fileRef} type="file" className="input text-sm"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setFile(f);
                      if (f && !form.title) setForm(fm => ({ ...fm, title: f.name.replace(/\.[^.]+$/, '') }));
                    }} />
                  <p className="text-xs text-slate-400 mt-1">PDF, Word, Image · max 10 MB</p>
                  {formErr && <p className="text-red-400 text-sm mt-1">{formErr}</p>}
                  <div className="flex justify-end gap-2 mt-4">
                    <button type="button" className="btn-secondary" onClick={resetModal}>Cancel</button>
                    <button className="btn-primary" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>
                      {upload.isPending ? 'Uploading…' : 'Upload'}
                    </button>
                  </div>
                </div>
              )}

              {/* Webcam tab */}
              {captureMode === 'webcam' && (
                <div className="space-y-3">
                  {!capturedDataUrl ? (
                    <div className="space-y-3">
                      <div className="relative bg-slate-900 rounded-lg overflow-hidden" style={{ minHeight: 240 }}>
                        <video ref={videoRef} playsInline muted className="w-full rounded-lg" style={{ display: webcamActive ? 'block' : 'none' }} />
                        {!webcamActive && (
                          <div className="flex flex-col items-center justify-center h-60 gap-3 text-slate-400">
                            <Camera size={40} className="opacity-40" />
                            <p className="text-sm">Camera preview will appear here</p>
                          </div>
                        )}
                      </div>
                      {formErr && <p className="text-red-400 text-sm">{formErr}</p>}
                      <div className="flex gap-2">
                        {!webcamActive
                          ? <button className="btn-primary flex-1" onClick={startWebcam}><Camera size={14} /> Start Camera</button>
                          : <button className="btn-primary flex-1" onClick={captureFrame}><Camera size={14} /> Capture Photo</button>
                        }
                        {webcamActive && <button className="btn-secondary" onClick={stopWebcam}>Stop</button>}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <img src={capturedDataUrl} alt="Captured" className="w-full rounded-lg border border-slate-200 dark:border-slate-700" />
                      {formErr && <p className="text-red-400 text-sm">{formErr}</p>}
                      <div className="flex gap-2">
                        <button className="btn-secondary flex-1" onClick={() => { setCapturedDataUrl(null); startWebcam(); }}>Retake</button>
                        <button className="btn-primary flex-1" disabled={webcamUpload.isPending} onClick={() => webcamUpload.mutate()}>
                          {webcamUpload.isPending ? 'Saving…' : 'Save Document'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Scanner tab */}
              {captureMode === 'scanner' && (
                <div className="space-y-3">
                  {scanners.length > 0 && (
                    <div>
                      <label className="label">Select Scanner</label>
                      <select className="input" value={selectedScanner} onChange={(e) => setSelectedScanner(e.target.value)}>
                        {scanners.map(s => <option key={s.device} value={s.device}>{s.name}</option>)}
                      </select>
                    </div>
                  )}
                  {formErr && <p className="text-amber-500 text-sm">{formErr}</p>}
                  {scanning && (
                    <div className="flex items-center gap-3 text-slate-500 text-sm p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div className="animate-spin w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full shrink-0" />
                      Scanning… please wait (this may take up to 30 seconds)
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button className="btn-secondary" onClick={loadScanners}>Refresh Scanners</button>
                    <button className="btn-primary flex-1" disabled={scanning} onClick={doScan}>
                      <ScanLine size={14} /> {scanning ? 'Scanning…' : 'Scan Now'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">Requires SANE (<code>scanimage</code>) to be installed on the server.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DeactivateModal ──────────────────────────────────────────────────────────

const EXIT_REASON_LABELS: Record<string, string> = {
  resigned:    'Resigned',
  terminated:  'Terminated / Dismissed',
  retired:     'Retired',
  transferred: 'Transferred (to another org)',
  deceased:    'Deceased',
};

function DeactivateModal({ emp, onClose, onConfirm, isPending, error }: {
  emp: { first_name: string; last_name: string; staff_no: string };
  onClose: () => void;
  onConfirm: (p: { exitReason: string; exitDate: string; exitNotes?: string }) => void;
  isPending: boolean;
  error: Error | null;
}) {
  const [exitReason, setExitReason] = useState('resigned');
  const [exitDate, setExitDate] = useState(new Date().toISOString().slice(0, 10));
  const [exitNotes, setExitNotes] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 text-red-500">
            <LogOut size={18} />
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Exit Staff Member</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-500">
            You are about to deactivate <strong className="text-slate-800 dark:text-slate-100">{emp.first_name} {emp.last_name}</strong> (<span className="font-mono text-brand-400">{emp.staff_no}</span>).
            Their active employment record will be closed.
          </p>
          <div>
            <label className="label">Exit Reason *</label>
            <select className="input" value={exitReason} onChange={e => setExitReason(e.target.value)}>
              {Object.entries(EXIT_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Last Working Date *</label>
            <input type="date" className="input" value={exitDate} onChange={e => setExitDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input min-h-[80px]" placeholder="Additional details about the departure…" value={exitNotes} onChange={e => setExitNotes(e.target.value)} />
          </div>
          {error && <p className="text-red-400 text-sm">{(error as any)?.response?.data?.message ?? error.message}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
            disabled={isPending || !exitDate}
            onClick={() => onConfirm({ exitReason, exitDate, exitNotes: exitNotes || undefined })}
          >
            <LogOut size={14} /> {isPending ? 'Deactivating…' : 'Confirm Exit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DocViewerModal ────────────────────────────────────────────────────────────

function DocViewerModal({ doc, onClose }: {
  doc: { id: string; title: string; mime_type: string };
  onClose: () => void;
}) {
  const blobUrl = useDocumentBlob(doc.id);
  const isImage = doc.mime_type?.startsWith('image/');
  const isPdf   = doc.mime_type === 'application/pdf';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-900 border-b border-slate-700 shrink-0">
        <p className="text-sm font-medium text-white truncate max-w-md">{doc.title}</p>
        <div className="flex items-center gap-2 shrink-0">
          {blobUrl && (
            <a href={blobUrl} download={doc.title} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">
              <Download size={13} /> Download
            </a>
          )}
          <button onClick={onClose} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">
            <X size={13} /> Close
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
        {!blobUrl && (
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <div className="animate-spin w-10 h-10 border-2 border-brand-400 border-t-transparent rounded-full" />
            <p className="text-sm">Loading document…</p>
          </div>
        )}
        {blobUrl && isImage && (
          <img src={blobUrl} alt={doc.title} className="max-w-full max-h-full object-contain rounded shadow-2xl" style={{ maxHeight: 'calc(100vh - 100px)' }} />
        )}
        {blobUrl && isPdf && (
          <iframe
            src={blobUrl}
            title={doc.title}
            className="w-full rounded shadow-2xl"
            style={{ height: 'calc(100vh - 100px)', border: 'none' }}
          />
        )}
        {blobUrl && !isImage && !isPdf && (
          <div className="text-center space-y-4">
            <FileText size={64} className="text-slate-500 mx-auto" />
            <p className="text-slate-300 text-sm">This file type cannot be previewed inline.</p>
            <a href={blobUrl} download={doc.title} className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-colors">
              <Download size={14} /> Download to View
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ATTENDANCE TAB
// ═══════════════════════════════════════════════════════════════════════════════
interface AttendanceRecord {
  id: string;
  attendance_term_id: string;
  year: number;
  term: 'I' | 'II' | 'III';
  school_type: 'DAY' | 'BOARDING';
  weeks: number;
  expected_days: number;
  days_present: number;
  days_absent: number;
  attendance_percentage: number;
  rating: string;
  notes?: string;
  absence_details: { reason: string; days: number; notes?: string }[];
}

const ATT_DEFAULT_REASONS = ['Sick Leave', 'Official Duty', 'Personal Leave', 'Maternity Leave', 'Unauthorised'];

const ratingColor = (r: string) => {
  if (r === 'EXCELLENT') return 'bg-emerald-100 text-emerald-700';
  if (r === 'GOOD')      return 'bg-blue-100 text-blue-700';
  if (r === 'FAIR')      return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
};

interface AttRecordForm {
  year: string;
  term: 'I' | 'II' | 'III';
  weeks: string;
  schoolType: 'DAY' | 'BOARDING';
  daysPresent: string;
  daysAbsent: string;
  notes: string;
  absences: { reason: string; days: string; notes: string }[];
}

function AttendanceTab({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const { hasPermission } = useAuthStore();
  const canEdit = hasPermission('attendance', 'create') || hasPermission('attendance', 'update');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [form, setForm] = useState<AttRecordForm>({
    year: String(new Date().getFullYear()), term: 'I', weeks: '13', schoolType: 'DAY',
    daysPresent: '', daysAbsent: '', notes: '',
    absences: ATT_DEFAULT_REASONS.map((r) => ({ reason: r, days: '0', notes: '' })),
  });
  const [formErr, setFormErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<AttendanceRecord | null>(null);

  const { data: records = [] } = useQuery<AttendanceRecord[]>({
    queryKey: ['attendance-records', employeeId],
    queryFn: () => window.sakAPI.attendance.listRecords({ staffId: employeeId }) as Promise<AttendanceRecord[]>,
  });

  const expectedDays = form.weeks ? Number(form.weeks) * (form.schoolType === 'BOARDING' ? 7 : 6) : 0;
  const totalAbsent = form.absences.reduce((s, a) => s + (parseInt(a.days) || 0), 0);
  const attPresentNum = form.daysPresent !== '' ? parseInt(form.daysPresent) : Math.max(0, expectedDays - (parseInt(form.daysAbsent || '0') || 0));
  const attendancePct = expectedDays > 0
    ? ((attPresentNum / expectedDays) * 100).toFixed(1)
    : '0.0';

  function handleDaysPresentChange(val: string) {
    const p = parseInt(val);
    if (expectedDays > 0 && !isNaN(p)) {
      setForm((f) => ({ ...f, daysPresent: val, daysAbsent: String(Math.max(0, expectedDays - p)) }));
    } else {
      setForm((f) => ({ ...f, daysPresent: val, daysAbsent: '' }));
    }
  }

  function handleDaysAbsentChange(val: string) {
    const a = parseInt(val);
    if (expectedDays > 0 && !isNaN(a)) {
      setForm((f) => ({ ...f, daysAbsent: val, daysPresent: String(Math.max(0, expectedDays - a)) }));
    } else {
      setForm((f) => ({ ...f, daysAbsent: val, daysPresent: '' }));
    }
  }

  // Summary stats
  const avgPct = (records as AttendanceRecord[]).length > 0
    ? (records as AttendanceRecord[]).reduce((s, r) => s + Number(r.attendance_percentage), 0) / (records as AttendanceRecord[]).length
    : null;

  const save = useMutation({
    mutationFn: (data: unknown) => editing
      ? window.sakAPI.attendance.updateRecord(editing.id, data)
      : window.sakAPI.attendance.createRecord(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance-records', employeeId] }); closeForm(); },
    onError: (e: any) => setFormErr(e?.response?.data?.message ?? e?.message ?? 'Save failed'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => window.sakAPI.attendance.deleteRecord(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance-records', employeeId] }); setConfirmDelete(null); },
    onError: (e: any) => alert(e?.response?.data?.message ?? e?.message ?? 'Delete failed'),
  });

  function openAdd() {
    setEditing(null);
    setFormErr('');
    setForm({ year: String(new Date().getFullYear()), term: 'I', weeks: '13', schoolType: 'DAY', daysPresent: '', daysAbsent: '', notes: '', absences: ATT_DEFAULT_REASONS.map((r) => ({ reason: r, days: '0', notes: '' })) });
    setShowForm(true);
  }

  function openEdit(rec: AttendanceRecord) {
    setEditing(rec);
    setFormErr('');
    const existingReasons = rec.absence_details.map((a) => a.reason);
    const extraDefaults = ATT_DEFAULT_REASONS.filter((r) => !existingReasons.includes(r));
    const absences = [
      ...rec.absence_details.map((a) => ({ reason: a.reason, days: String(a.days), notes: a.notes ?? '' })),
      ...extraDefaults.map((r) => ({ reason: r, days: '0', notes: '' })),
    ];
    setForm({ year: String(rec.year), term: rec.term, weeks: String(rec.weeks), schoolType: rec.school_type, daysPresent: String(rec.days_present), daysAbsent: String(rec.days_absent), notes: rec.notes ?? '', absences });
    setShowForm(true);
  }

  function closeForm() { setShowForm(false); setEditing(null); }

  function updateAbsence(idx: number, field: 'reason' | 'days' | 'notes', val: string) {
    setForm((f) => { const abs = [...f.absences]; abs[idx] = { ...abs[idx], [field]: val }; return { ...f, absences: abs }; });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.year || !form.weeks || (form.daysPresent === '' && form.daysAbsent === '')) { setFormErr('Year, weeks, and either Days Present or Days Absent are required'); return; }
    const absences = form.absences.filter((a) => parseInt(a.days) > 0 && a.reason.trim())
      .map((a) => ({ reason: a.reason.trim(), days: parseInt(a.days), notes: a.notes.trim() || undefined }));
    const expDays2 = parseInt(form.weeks) * (form.schoolType === 'BOARDING' ? 7 : 6);
    const resolvedPresent = form.daysPresent !== ''
      ? parseInt(form.daysPresent)
      : Math.max(0, expDays2 - parseInt(form.daysAbsent || '0'));
    const payload: Record<string, unknown> = {
      year: parseInt(form.year), term: form.term, weeks: parseInt(form.weeks),
      schoolType: form.schoolType, daysPresent: resolvedPresent,
      notes: form.notes.trim() || undefined, absences,
    };
    if (!editing) payload.employeeId = employeeId;
    save.mutate(payload);
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      {avgPct !== null && (
        <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20 border border-blue-100 dark:border-blue-900/40">
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">Overall Attendance Average</p>
          <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{avgPct.toFixed(1)}%</p>
          <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full font-medium ${ratingColor(avgPct >= 95 ? 'EXCELLENT' : avgPct >= 85 ? 'GOOD' : avgPct >= 70 ? 'FAIR' : 'POOR')}`}>
            {avgPct >= 95 ? 'EXCELLENT' : avgPct >= 85 ? 'GOOD' : avgPct >= 70 ? 'FAIR' : 'POOR'}
          </span>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Attendance Records by Term</h3>
        {canEdit && (
          <button onClick={openAdd} className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3">
            <Plus size={14} /> Add Record
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-2.5 px-4 font-medium text-slate-600 dark:text-slate-400">Year</th>
                <th className="text-left py-2.5 px-4 font-medium text-slate-600 dark:text-slate-400">Term</th>
                <th className="text-right py-2.5 px-4 font-medium text-slate-600 dark:text-slate-400">Expected</th>
                <th className="text-right py-2.5 px-4 font-medium text-slate-600 dark:text-slate-400">Present</th>
                <th className="text-right py-2.5 px-4 font-medium text-slate-600 dark:text-slate-400">Absent</th>
                <th className="text-right py-2.5 px-4 font-medium text-slate-600 dark:text-slate-400">%</th>
                <th className="text-left py-2.5 px-4 font-medium text-slate-600 dark:text-slate-400">Rating</th>
                {canEdit && <th className="py-2.5 px-4"></th>}
              </tr>
            </thead>
            <tbody>
              {(records as AttendanceRecord[]).map((r) => (
                <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-2.5 px-4">{r.year}</td>
                  <td className="py-2.5 px-4">Term {r.term}</td>
                  <td className="py-2.5 px-4 text-right">{r.expected_days}</td>
                  <td className="py-2.5 px-4 text-right text-emerald-600 font-medium">{r.days_present}</td>
                  <td className="py-2.5 px-4 text-right text-red-500">{r.days_absent}</td>
                  <td className="py-2.5 px-4 text-right font-medium">{Number(r.attendance_percentage).toFixed(1)}%</td>
                  <td className="py-2.5 px-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ratingColor(r.rating)}`}>{r.rating}</span>
                  </td>
                  {canEdit && (
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openEdit(r)} className="text-slate-400 hover:text-blue-600"><Pencil size={13} /></button>
                        <button onClick={() => setConfirmDelete(r)} className="text-slate-400 hover:text-red-600"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {(records as AttendanceRecord[]).length === 0 && (
                <tr><td colSpan={canEdit ? 8 : 7} className="py-6 text-center text-slate-400 text-sm">No attendance records yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit/Add Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg my-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">
                {editing ? `Edit Attendance — Term ${editing.term} ${editing.year}` : 'Add Attendance Record'}
              </h2>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formErr && <p className="text-red-600 text-sm">{formErr}</p>}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Year *</label>
                  <input type="number" className="input" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} min={2000} max={2100} />
                </div>
                <div>
                  <label className="label">Term *</label>
                  <select className="input" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value as any })}>
                    <option value="I">Term I</option>
                    <option value="II">Term II</option>
                    <option value="III">Term III</option>
                  </select>
                </div>
                <div>
                  <label className="label">School Type *</label>
                  <select className="input" value={form.schoolType} onChange={(e) => setForm({ ...form, schoolType: e.target.value as any })}>
                    <option value="DAY">Day (6 days/week)</option>
                    <option value="BOARDING">Boarding (7 days/week)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Weeks *</label>
                  <input type="number" className="input" value={form.weeks} onChange={(e) => setForm({ ...form, weeks: e.target.value })} min={1} max={52} />
                </div>
              </div>

              {expectedDays > 0 && (
                <p className="text-xs text-slate-500">Expected days this term: <strong>{expectedDays}</strong></p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Days Present</label>
                  <input type="number" className="input" value={form.daysPresent} onChange={(e) => handleDaysPresentChange(e.target.value)} min={0} max={expectedDays || 999} placeholder="e.g. 75" />
                  <p className="text-xs text-slate-400 mt-0.5">Auto-fills Days Absent</p>
                </div>
                <div>
                  <label className="label">Days Absent</label>
                  <input type="number" className="input" value={form.daysAbsent} onChange={(e) => handleDaysAbsentChange(e.target.value)} min={0} max={expectedDays || 999} placeholder="e.g. 5" />
                  <p className="text-xs text-slate-400 mt-0.5">Auto-fills Days Present</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Absence Breakdown by Reason</label>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, absences: [...f.absences, { reason: '', days: '0', notes: '' }] }))} className="text-xs text-blue-600 flex items-center gap-1">
                    <Plus size={12} /> Add row
                  </button>
                </div>
                <div className="space-y-2">
                  {form.absences.map((a, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input className="input flex-1 text-sm" placeholder="Reason" value={a.reason} onChange={(e) => updateAbsence(i, 'reason', e.target.value)} />
                      <input type="number" className="input w-16 text-right text-sm" min={0} value={a.days} onChange={(e) => updateAbsence(i, 'days', e.target.value)} />
                      <span className="text-xs text-slate-400 w-6">days</span>
                      <button type="button" onClick={() => setForm((f) => ({ ...f, absences: f.absences.filter((_, j) => j !== i) }))} className="text-slate-300 hover:text-red-500"><X size={13} /></button>
                    </div>
                  ))}
                </div>
              </div>

              {expectedDays > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-slate-600">Expected:</span><span className="font-medium">{expectedDays}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Absent (breakdown):</span><span className="font-medium">{totalAbsent}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Days present:</span><span className="font-medium text-emerald-600">{form.daysPresent || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Days absent:</span><span className="font-medium text-red-500">{form.daysAbsent || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Attendance %:</span><span className="font-medium">{attendancePct}%</span></div>
                </div>
              )}

              <div>
                <label className="label">Notes</label>
                <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={closeForm} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Delete Record</h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">Delete attendance record for Term {confirmDelete.term} {confirmDelete.year}?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => remove.mutate(confirmDelete.id)} className="btn-primary bg-red-600 hover:bg-red-700" disabled={remove.isPending}>
                {remove.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
