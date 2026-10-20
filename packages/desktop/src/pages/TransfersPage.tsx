import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, CheckCircle, FileText, XCircle, Trash2 } from 'lucide-react';
import { formatDate } from '@sak/shared';
import { useAuthStore } from '../store/authStore';
import SignaturePad from '../components/SignaturePad';
import { escapeHtml, writePrintDocument } from '../lib/printWindow';

interface Campus     { id: string; name: string }
interface Employee   { id: string; first_name: string; last_name: string; staff_no: string }
interface Department { id: string; name: string; campus_id: string | null }
interface JobTitle   { id: string; title: string; category: string; department_id: string | null }
const EMPTY_FORM = {
  employeeId: '', type: 'transfer' as const,
  fromCampusId: '', toCampusId: '',
  fromDepartmentId: '', toDepartmentId: '',
  fromJobTitle: '', toJobTitle: '',
  effectiveDate: new Date().toISOString().slice(0, 10),
  reason: '', notes: '',
};

const EMPTY_APPROVE_FORM = {
  action: 'approved' as 'approved' | 'rejected',
  approvalComment: '',
  approvalSignature: '',
  approvalRole: '',
  approvalDate: new Date().toISOString().slice(0, 10),
};

export default function TransfersPage() {
  const { hasPermission } = useAuthStore();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErr, setFormErr] = useState('');

  // Approval modal state
  const [approveTarget, setApproveTarget] = useState<typeof transfers[number] | null>(null);
  const [approveForm, setApproveForm] = useState(EMPTY_APPROVE_FORM);
  const [approveErr, setApproveErr] = useState('');

  const canCreate  = hasPermission('transfers', 'create');
  const canApprove = hasPermission('transfers', 'approve');
  const canEdit    = hasPermission('transfers', 'update');
  const canCancel  = hasPermission('transfers', 'update');
  const canDelete  = hasPermission('transfers', 'delete');

  const { data = [], isLoading } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => window.sakAPI.transfers.list(),
  });

  const { data: campuses = [] } = useQuery<Campus[]>({
    queryKey: ['campuses'],
    queryFn: () => window.sakAPI.campuses.list() as Promise<Campus[]>,
    enabled: showModal,
  });

  const { data: allDepts = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => window.sakAPI.campuses.listDepartments() as Promise<Department[]>,
    enabled: showModal,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees-list'],
    queryFn: async () => {
      const res = await window.sakAPI.employees.list({ limit: 200 });
      return (Array.isArray(res) ? res : (res as any)?.data ?? []) as Employee[];
    },
    enabled: showModal,
  });

  const { data: allJobTitles = [] } = useQuery<JobTitle[]>({
    queryKey: ['job-titles'],
    queryFn: () => window.sakAPI.jobTitles.list({ active: 'true' }) as Promise<JobTitle[]>,
    enabled: showModal,
  });

  const transfers = data as {
    id: string; type: string; status: string;
    employee_id: string;
    employee_name: string; staff_no: string;
    photo_path: string | null;
    from_campus_id: string; to_campus_id: string;
    from_department_id: string | null; to_department_id: string | null;
    from_job_title: string | null; to_job_title: string | null;
    from_campus_name: string; to_campus_name: string;
    from_department_name: string | null; to_department_name: string | null;
    effective_date: string; reason: string; notes: string | null;
    approved_by: string | null; approver_name: string | null;
    approved_at: string | null; approval_date: string | null;
    approval_comment: string | null; approval_signature: string | null;
    approval_role: string | null;
  }[];

  const buildPayload = () => ({
    employeeId:       form.employeeId,
    type:             form.type,
    fromCampusId:     form.fromCampusId,
    toCampusId:       form.toCampusId,
    fromDepartmentId: form.fromDepartmentId || undefined,
    toDepartmentId:   form.toDepartmentId   || undefined,
    fromJobTitle:     form.fromJobTitle      || undefined,
    toJobTitle:       form.toJobTitle        || undefined,
    effectiveDate:    form.effectiveDate,
    reason:           form.reason,
    notes:            form.notes            || undefined,
  });

  const closeModal = () => { setShowModal(false); setEditingId(null); setForm(EMPTY_FORM); setFormErr(''); };

  const createTransfer = useMutation({
    mutationFn: () => window.sakAPI.transfers.create(buildPayload()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); closeModal(); },
    onError: (e: any) => setFormErr(e?.response?.data?.message ?? 'Create failed'),
  });

  const updateTransfer = useMutation({
    mutationFn: () => window.sakAPI.transfers.update(editingId!, buildPayload()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); closeModal(); },
    onError: (e: any) => setFormErr(e?.response?.data?.message ?? 'Update failed'),
  });

  const cancelTransfer = useMutation({
    mutationFn: (id: string) => window.sakAPI.transfers.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfers'] }),
  });

  const deleteTransfer = useMutation({
    mutationFn: (id: string) => window.sakAPI.transfers.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfers'] }),
  });

  const openEdit = (t: typeof transfers[number]) => {
    setEditingId(t.id);
    setForm({
      employeeId:       t.employee_id,
      type:             t.type as typeof EMPTY_FORM['type'],
      fromCampusId:     t.from_campus_id,
      toCampusId:       t.to_campus_id,
      fromDepartmentId: t.from_department_id ?? '',
      toDepartmentId:   t.to_department_id   ?? '',
      fromJobTitle:     t.from_job_title     ?? '',
      toJobTitle:       t.to_job_title       ?? '',
      effectiveDate:    t.effective_date.slice(0, 10),
      reason:           t.reason,
      notes:            t.notes             ?? '',
    });
    setFormErr('');
    setShowModal(true);
  };

  const approveMutation = useMutation({
    mutationFn: () => window.sakAPI.transfers.approve(
      approveTarget!.id,
      approveForm.action,
      {
        approvalComment:   approveForm.approvalComment   || undefined,
        approvalSignature: approveForm.approvalSignature || undefined,
        approvalRole:      approveForm.approvalRole      || undefined,
        approvalDate:      approveForm.approvalDate      || undefined,
      }
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      setApproveTarget(null);
      setApproveForm(EMPTY_APPROVE_FORM);
      setApproveErr('');
    },
    onError: (e: any) => setApproveErr(e?.response?.data?.message ?? 'Action failed'),
  });

  const openApprove = (t: typeof transfers[number], action: 'approved' | 'rejected', editExisting = false) => {
    setApproveTarget(t);
    if (editExisting && t.status === 'approved') {
      // Pre-fill with existing approval data so the GM can amend it
      setApproveForm({
        action: 'approved',
        approvalComment:   t.approval_comment   ?? '',
        approvalSignature: t.approval_signature ?? '',
        approvalRole:      t.approval_role      ?? '',
        approvalDate:      t.approval_date      ? t.approval_date.slice(0, 10)
                         : t.approved_at        ? t.approved_at.slice(0, 10)
                         : new Date().toISOString().slice(0, 10),
      });
    } else {
      setApproveForm({ ...EMPTY_APPROVE_FORM, action });
    }
    setApproveErr('');
  };

  const setA = (k: keyof typeof approveForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setApproveForm((f) => ({ ...f, [k]: e.target.value }));

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Filter depts by campus — fall back to all depts if none are assigned to that campus
  const _fromDeptsFiltered = allDepts.filter((d) => d.campus_id === form.fromCampusId);
  const _toDeptsFiltered   = allDepts.filter((d) => d.campus_id === form.toCampusId);
  const fromDepts = _fromDeptsFiltered.length > 0 ? _fromDeptsFiltered : allDepts;
  const toDepts   = _toDeptsFiltered.length   > 0 ? _toDeptsFiltered   : allDepts;

  // Filter job titles by selected department — fall back to all if dept has none assigned
  const _fromJTFiltered = allJobTitles.filter((j) => j.department_id === form.fromDepartmentId);
  const _toJTFiltered   = allJobTitles.filter((j) => j.department_id === form.toDepartmentId);
  const fromJobTitles = (form.fromDepartmentId && _fromJTFiltered.length > 0) ? _fromJTFiltered : allJobTitles;
  const toJobTitles   = (form.toDepartmentId   && _toJTFiltered.length   > 0) ? _toJTFiltered   : allJobTitles;

  const printTransferReport = (t: typeof transfers[number]) => {
    const typeLabel  = t.type.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const toDest     = t.to_department_name ? `${escapeHtml(t.to_campus_name)} – ${escapeHtml(t.to_department_name)}` : t.to_campus_name;
    const fromSrc    = t.from_department_name ? `${escapeHtml(t.from_campus_name)} – ${escapeHtml(t.from_department_name)}` : t.from_campus_name;
    // Annotation header = WHERE the transfer is directed TO (the destination dept/campus)
    const recipientTitle = t.to_department_name || t.to_campus_name;
    const hasApproval = t.status === 'approved' && t.approval_signature;

    // Compute sig HTML outside the template literal to avoid triple-nesting
    const sigHtml = t.approval_signature?.startsWith('data:image')
      ? `<img src="${escapeHtml(t.approval_signature)}" class="ann-sig-img" alt="signature"/>`
      : `<span class="ann-sig-name">${escapeHtml(t.approval_signature)}</span>`;

    // Roman numeral routing — "I" for 1st routing; extend when multi-hop is tracked.
    const routingNumeral = 'I';

    // Side margin annotation — floated to the right like a handwritten note on a physical letter
    const annotationBlock = hasApproval
      ? `<div class="annotation-note">
          <div class="ann-numeral">${routingNumeral}</div>
          <div class="ann-recipient">${escapeHtml(recipientTitle)}</div>
          <p class="ann-comment">${t.approval_comment ? escapeHtml(t.approval_comment) : 'Acknowledged and forwarded for necessary action.'}</p>
          <div class="ann-sig-block">
            ${sigHtml}
            <div class="ann-sig-line"></div>
            <span class="ann-role">${escapeHtml(t.approval_role)}</span>
            <span class="ann-date">${t.approval_date ? formatDate(t.approval_date) : formatDate(t.approved_at ?? '')}</span>
          </div>
        </div>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Transfer Letter – ${escapeHtml(t.employee_name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; font-size: 13px; color: #1e293b; background: #fff; }
  .page { max-width: 780px; margin: 0 auto; padding: 40px 50px 60px; }

  /* Letterhead */
  .header { display: flex; align-items: center; gap: 18px; border-bottom: 3px double #1e40af; padding-bottom: 14px; margin-bottom: 20px; }
  .logo-img { width: 80px; height: 80px; object-fit: contain; flex-shrink: 0; }
  .org-block { flex: 1; text-align: center; }
  .org-name { font-size: 18px; font-weight: 800; color: #1e293b; letter-spacing: .03em; text-transform: uppercase; line-height: 1.25; }
  .org-motto { font-family: Calibri, 'Gill Sans', sans-serif; font-size: 12px; font-style: italic; color: #475569; margin: 3px 0 4px; }
  .org-sub  { font-size: 11px; color: #64748b; }

  /* ── Side annotation (like a handwritten note on the letter margin) ── */
  .doc-wrapper { position: relative; }
  .letter-body  { margin-right: 220px; }
  .annotation-note {
    position: absolute;
    top: 0;
    right: 0;
    width: 200px;
    background: #fffbeb;
    border: 1.5px solid #fbbf24;
    border-radius: 6px;
    padding: 14px 12px 12px;
    font-family: 'Caveat', cursive;
    box-shadow: 2px 3px 8px rgba(0,0,0,.10);
  }
  .ann-numeral {
    font-family: 'Times New Roman', Times, serif;
    font-size: 38px;
    font-weight: 700;
    color: #1e293b;
    text-align: center;
    line-height: 1;
    margin-bottom: 4px;
  }
  .ann-recipient {
    font-family: 'Caveat', cursive;
    font-size: 15px;
    font-weight: 700;
    text-align: center;
    color: #1e40af;
    letter-spacing: .03em;
    border-bottom: 1px dashed #93c5fd;
    padding-bottom: 8px;
    margin-bottom: 10px;
  }
  .ann-comment {
    font-family: 'Caveat', cursive;
    font-size: 16px;
    color: #1e293b;
    line-height: 1.5;
    margin-bottom: 14px;
  }
  .ann-sig-block { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .ann-sig-name {
    font-family: 'Caveat', cursive;
    font-size: 22px;
    font-weight: 700;
    color: #1e293b;
    display: block;
    text-align: center;
  }
  .ann-sig-line  { width: 120px; border-top: 1.5px solid #334155; margin: 3px 0 2px; }
  .ann-sig-img   { max-height: 52px; max-width: 170px; display: block; margin: 0 auto 2px; object-fit: contain; }
  .ann-role {
    font-family: 'Caveat', cursive;
    font-size: 14px;
    font-weight: 600;
    color: #334155;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .ann-date {
    font-family: 'Caveat', cursive;
    font-size: 13px;
    color: #64748b;
    text-align: center;
    margin-top: 1px;
  }

  /* Doc title */
  .doc-title { text-align: center; margin: 0 0 18px; }
  .doc-title h1 { font-size: 16px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #1e40af; border-bottom: 1.5px solid #cbd5e1; display: inline-block; padding-bottom: 4px; }
  .doc-title p  { font-size: 11px; color: #64748b; margin-top: 4px; }

  /* Ref bar */
  .meta-bar { display: flex; justify-content: space-between; font-size: 11px; color: #64748b; margin-bottom: 20px; }

  /* Sections */
  .section { margin-bottom: 18px; }
  .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 10px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
  .field label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; }
  .field p     { font-size: 13px; color: #1e293b; font-weight: 500; margin-top: 1px; }

  /* Status badge */
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: capitalize; }
  .badge-approved { background: #d1fae5; color: #065f46; }
  .badge-pending  { background: #fef3c7; color: #92400e; }
  .badge-rejected { background: #fee2e2; color: #991b1b; }

  /* Reason box */
  .reason-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; font-size: 13px; color: #334155; line-height: 1.6; }

  /* Footer */
  .footer { margin-top: 44px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Letterhead -->
  <div class="header">
    <img class="logo-img" src="${window.location.origin}/sak.jpg" alt="SAK Badge" onerror="this.style.display='none'"/>
    <div class="org-block">
      <div class="org-name">Sir Apollo Kaggwa Schools &mdash; Since 1996</div>
      <div class="org-motto">&ldquo;where your child is guaranteed a quality first grade&rdquo;</div>
      <div class="org-sub">P.O. Box 7513, Kampala &ndash; Uganda</div>
    </div>
  </div>

  <!-- Letter title -->
  <div class="doc-title">
    <h1>${escapeHtml(typeLabel)} Letter</h1>
    <p>Official staff deployment record</p>
  </div>

  <!-- Ref bar -->
  <div class="meta-bar">
    <span>Ref: SAK/HR/${t.type.toUpperCase()}/${t.id.slice(0, 8).toUpperCase()}</span>
    <span>Document Date: ${formatDate(t.effective_date)}</span>
    <span>Status: <span class="badge badge-${escapeHtml(t.status)}">${escapeHtml(t.status)}</span></span>
  </div>

  <!-- Two-column wrapper: letter body left, annotation note right -->
  <div class="doc-wrapper">
  ${annotationBlock}
  <div class="letter-body">

  <!-- Staff information -->
  <div class="section">
    <div class="section-title">Staff Information</div>
    <div class="grid2">
      <div class="field"><label>Full Name</label><p>${escapeHtml(t.employee_name)}</p></div>
      <div class="field"><label>Staff Number</label><p>${escapeHtml(t.staff_no)}</p></div>
      <div class="field"><label>From Job Title</label><p>${escapeHtml(t.from_job_title) || '—'}</p></div>
      <div class="field"><label>To Job Title</label><p>${escapeHtml(t.to_job_title) || '—'}</p></div>
    </div>
  </div>

  <!-- Transfer details -->
  <div class="section">
    <div class="section-title">Transfer Details</div>
    <div class="grid2">
      <div class="field"><label>Type</label><p>${escapeHtml(typeLabel)}</p></div>
      <div class="field"><label>Effective Date</label><p>${formatDate(t.effective_date)}</p></div>
      <div class="field"><label>From Station</label><p>${escapeHtml(fromSrc)}</p></div>
      <div class="field"><label>To Station</label><p>${escapeHtml(toDest)}</p></div>
    </div>
  </div>

  <!-- Reason -->
  <div class="section">
    <div class="section-title">Reason / Justification</div>
    <div class="reason-box">${escapeHtml(t.reason)}</div>
  </div>

  ${t.notes ? `<div class="section">
    <div class="section-title">Additional Notes</div>
    <div class="reason-box">${escapeHtml(t.notes)}</div>
  </div>` : ''}

  </div><!-- /letter-body -->
  </div><!-- /doc-wrapper -->

  <!-- Footer -->
  <div class="footer">
    <span>Generated by SAK Staffing</span>
    <span>Printed: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
  </div>

  <div class="no-print" style="text-align:center;margin-top:24px;">
    <button data-print-button
      style="background:#1e40af;color:#fff;border:none;padding:10px 28px;border-radius:6px;font-size:14px;cursor:pointer;">
      🖨 Print / Save as PDF
    </button>
  </div>
</div>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=860,height=750');
    if (!win) return;
    writePrintDocument(win, html);
    setTimeout(() => win.focus(), 400);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Transfers & Promotions</h1>
          <p className="text-slate-400 text-sm mt-0.5">Deployment history across all stations</p>
        </div>
        {canCreate && (
          <button className="btn-primary shrink-0" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setFormErr(''); setShowModal(true); }}>
            <Plus size={16} /> Add Transfer
          </button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
              <tr>
                {['Staff', 'Type', 'From', 'To', 'Effective Date', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {isLoading && <tr><td colSpan={7} className="text-center py-10 text-slate-500">Loading…</td></tr>}
              {!isLoading && !transfers.length && <tr><td colSpan={7} className="text-center py-10 text-slate-400">No transfers found</td></tr>}
              {transfers.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-slate-800 dark:text-slate-100 font-medium">{t.employee_name}</p>
                    <p className="text-xs text-brand-400 font-mono">{t.staff_no}</p>
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-300">{t.type}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{t.from_campus_name}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{t.to_campus_name}</td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(t.effective_date)}</td>
                  <td className="px-4 py-3">
                    <span className={`badge-${
                      t.status === 'approved'  ? 'approved'  :
                      t.status === 'pending'   ? 'pending'   :
                      t.status === 'cancelled' ? 'cancelled' : 'inactive'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 flex-wrap">
                      {t.status === 'approved' && (
                        <button onClick={() => printTransferReport(t)}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded">
                          <FileText size={11} /> View Report
                        </button>
                      )}
                      {canEdit && (
                        <button onClick={() => openEdit(t)}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded">
                          <Pencil size={11} /> Edit
                        </button>
                      )}
                      {canApprove && t.status === 'approved' && (
                        <button onClick={() => openApprove(t, 'approved', true)}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-amber-500 hover:bg-amber-400 text-white rounded">
                          <Pencil size={11} /> Edit Approval
                        </button>
                      )}
                      {canApprove && t.status === 'pending' && (
                        <button onClick={() => openApprove(t, 'approved')}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded">
                          <CheckCircle size={11} /> Review
                        </button>
                      )}
                      {canCancel && t.status === 'pending' && (
                        <button
                          onClick={() => {
                            if (window.confirm('Cancel this transfer? This cannot be undone.')) {
                              cancelTransfer.mutate(t.id);
                            }
                          }}
                          disabled={cancelTransfer.isPending}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded disabled:opacity-50">
                          <XCircle size={11} /> Cancel
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Permanently delete this ${t.type} record for ${t.employee_name}? This cannot be undone.`)) {
                              deleteTransfer.mutate(t.id);
                            }
                          }}
                          disabled={deleteTransfer.isPending}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 rounded disabled:opacity-50">
                          <Trash2 size={11} /> Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add / Edit Transfer Modal ───────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">
                {editingId ? 'Edit Transfer / Promotion' : 'New Transfer / Promotion'}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none">&times;</button>
            </div>
            <form className="p-5 space-y-4" onSubmit={(e) => { e.preventDefault(); editingId ? updateTransfer.mutate() : createTransfer.mutate(); }}>
              <div>
                <label className="label">Staff Member *</label>
                <select className="input" required value={form.employeeId} onChange={set('employeeId')}>
                  <option value="">— Select Staff —</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.staff_no})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Type *</label>
                <select className="input" required value={form.type} onChange={set('type')}>
                  <option value="transfer">Transfer</option>
                  <option value="promotion">Promotion</option>
                  <option value="demotion">Demotion</option>
                  <option value="acting">Acting</option>
                  <option value="temporary_assignment">Temporary Assignment</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">From Station *</label>
                  <select className="input" required value={form.fromCampusId}
                    onChange={(e) => setForm((f) => ({ ...f, fromCampusId: e.target.value, fromDepartmentId: '', fromJobTitle: '' }))}>                    
                    <option value="">— Station —</option>
                    {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">To Station *</label>
                  <select className="input" required value={form.toCampusId}
                    onChange={(e) => setForm((f) => ({ ...f, toCampusId: e.target.value, toDepartmentId: '', toJobTitle: '' }))}>                    
                    <option value="">— Station —</option>
                    {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">From Dept</label>
                  <select className="input" value={form.fromDepartmentId}
                    onChange={(e) => setForm((f) => ({ ...f, fromDepartmentId: e.target.value, fromJobTitle: '' }))}>
                    <option value="">— Dept —</option>
                    {fromDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">To Dept</label>
                  <select className="input" value={form.toDepartmentId}
                    onChange={(e) => setForm((f) => ({ ...f, toDepartmentId: e.target.value, toJobTitle: '' }))}>
                    <option value="">— Dept —</option>
                    {toDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">From Job Title</label>
                  <select className="input" value={form.fromJobTitle} onChange={set('fromJobTitle')}>
                    <option value="">— Job Title —</option>
                    {fromJobTitles.map((j) => <option key={j.id} value={j.title}>{j.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">To Job Title</label>
                  <select className="input" value={form.toJobTitle} onChange={set('toJobTitle')}>
                    <option value="">— Job Title —</option>
                    {toJobTitles.map((j) => <option key={j.id} value={j.title}>{j.title}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Effective Date *</label>
                <input className="input" type="date" required value={form.effectiveDate} onChange={set('effectiveDate')} />
              </div>
              <div>
                <label className="label">Reason *</label>
                <textarea className="input resize-none" rows={2} required value={form.reason} onChange={set('reason')} />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input resize-none" rows={2} value={form.notes} onChange={set('notes')} />
              </div>
              {formErr && <p className="text-red-400 text-sm">{formErr}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={createTransfer.isPending || updateTransfer.isPending}>
                  {(createTransfer.isPending || updateTransfer.isPending) ? 'Saving…' : editingId ? 'Save Changes' : 'Submit Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Approval / Rejection Modal ─────────────────────────────────────── */}
      {approveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 rounded-t-xl z-10">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">Review Transfer</h2>
              <button onClick={() => { setApproveTarget(null); setApproveErr(''); }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none">&times;</button>
            </div>

            <div className="overflow-y-auto flex-1">

            {/* Transfer summary */}
            <div className="px-5 pt-4 pb-2 bg-slate-50 dark:bg-slate-800/50 mx-5 rounded-lg mt-4 text-sm text-slate-600 dark:text-slate-300 space-y-1">
              <p><span className="font-medium text-slate-800 dark:text-slate-100">{approveTarget.employee_name}</span> &mdash; <span className="capitalize">{approveTarget.type}</span></p>
              <p className="text-xs text-slate-400">{approveTarget.from_campus_name} → {approveTarget.to_campus_name}</p>
              <p className="text-xs text-slate-400">Effective: {formatDate(approveTarget.effective_date)}</p>
            </div>

            <form className="p-5 space-y-4" onSubmit={(e) => {
                e.preventDefault();
                if (!approveForm.approvalSignature) { setApproveErr('Please draw or upload your signature.'); return; }
                if (!approveForm.approvalRole.trim()) { setApproveErr('Please enter your role / title.'); return; }
                approveMutation.mutate();
              }}>
              {/* Decision */}
              <div>
                <label className="label">Decision *</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="action" value="approved"
                      checked={approveForm.action === 'approved'}
                      onChange={() => setApproveForm((f) => ({ ...f, action: 'approved' }))}
                      className="accent-emerald-600" />
                    <span className="text-sm font-medium text-emerald-600">Approve</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="action" value="rejected"
                      checked={approveForm.action === 'rejected'}
                      onChange={() => setApproveForm((f) => ({ ...f, action: 'rejected' }))}
                      className="accent-red-500" />
                    <span className="text-sm font-medium text-red-500">Reject</span>
                  </label>
                </div>
              </div>

              {/* Comment */}
              <div>
                <label className="label">Comment / Remarks</label>
                <textarea className="input resize-none" rows={3}
                  placeholder="Add any remarks or conditions…"
                  value={approveForm.approvalComment} onChange={setA('approvalComment')} />
              </div>

              {/* Date */}
              <div>
                <label className="label">Approval Date *</label>
                <input className="input" type="date" required
                  value={approveForm.approvalDate} onChange={setA('approvalDate')} />
              </div>

              {/* Role / Title */}
              <div>
                <label className="label">Role / Title *</label>
                <input className="input" required
                  placeholder="e.g. General Manager, Head Teacher…"
                  value={approveForm.approvalRole} onChange={setA('approvalRole')} />
              </div>

              {/* Authorised Signature */}
              <div>
                <label className="label">Signature *</label>
                <SignaturePad
                  value={approveForm.approvalSignature}
                  onChange={(v) => setApproveForm((f) => ({ ...f, approvalSignature: v }))}
                />
              </div>

              {approveErr && <p className="text-red-400 text-sm">{approveErr}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-secondary"
                  onClick={() => { setApproveTarget(null); setApproveErr(''); }}>Cancel</button>
                <button type="submit" disabled={approveMutation.isPending}
                  className={`btn-primary ${approveForm.action === 'rejected' ? '!bg-red-600 hover:!bg-red-500' : ''}`}>
                  {approveMutation.isPending ? 'Saving…' : approveForm.action === 'approved' ? 'Confirm Approval' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
            </div>{/* /overflow-y-auto */}
          </div>
        </div>
      )}
    </div>
  );
}
