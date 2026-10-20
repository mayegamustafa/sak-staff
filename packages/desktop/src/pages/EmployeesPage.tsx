import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Search, UserPlus, Eye, ChevronLeft, ChevronRight, Printer, X, Link2, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { escapeHtml, writePrintDocument } from '../lib/printWindow';

interface Employee {
  id: string;
  staff_no: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  gender: string;
  phone: string;
  job_title?: string | null;
  campus_name?: string | null;
  subjects_of_preference?: string | null;
  is_active: number | boolean;
}

interface CampusOpt { id: string; name: string }
interface ClassOpt  { id: string; name: string; level: string }

const PAGE_SIZE = 20;

export default function EmployeesPage() {
  const [search,   setSearch]   = useState('');
  const [gender,   setGender]   = useState('');
  const [campusId, setCampusId] = useState('');
  const [status,   setStatus]   = useState('active');
  const [subject,  setSubject]  = useState('');
  const [classId,  setClassId]  = useState('');
  const [page,     setPage]     = useState(1);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const { hasPermission } = useAuthStore();
  const navigate = useNavigate();

  // Reset to page 1 whenever a filter changes
  const applyFilter = useCallback((fn: () => void) => { fn(); setPage(1); }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['employees', search, gender, campusId, status, subject, classId, page],
    queryFn: () => window.sakAPI.employees.list({ search, gender, campusId, status, subject, classId: classId || undefined, page, limit: PAGE_SIZE }),
    staleTime: 10_000,
    placeholderData: (prev: any) => prev,
  });

  const { data: campuses = [] } = useQuery<CampusOpt[]>({
    queryKey: ['campuses'],
    queryFn: () => window.sakAPI.campuses.list() as Promise<CampusOpt[]>,
    staleTime: 60_000,
  });

  const { data: allClasses = [] } = useQuery<ClassOpt[]>({
    queryKey: ['school-classes'],
    queryFn: async () => { const d = await (window.sakAPI as any).classes.list() as any; return Array.isArray(d) ? d : d?.data ?? []; },
    staleTime: 60_000,
  });

  async function printList() {
    setIsPrinting(true);
    try {
      const all = await window.sakAPI.employees.list({ search, gender, campusId, status, page: 1, limit: 9999 }) as any;
      const rows: Employee[] = Array.isArray(all) ? all : all?.data ?? [];
      const filterDesc = [
        campuses.find(c => c.id === campusId)?.name,
        gender ? gender.charAt(0).toUpperCase() + gender.slice(1) : '',
        status === 'all' ? 'All Status' : status === 'active' ? 'Active' : 'Inactive',
        search ? `"${search}"` : '',
      ].filter(Boolean).join(' · ');

      const html = `<!DOCTYPE html><html><head><title>Staff List</title><style>
        body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#111}
        h2{margin:0 0 4px}p{margin:0 0 12px;color:#555}
        table{border-collapse:collapse;width:100%}
        th,td{border:1px solid #ccc;padding:5px 8px;text-align:left}
        th{background:#f0f0f0;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
        tr:nth-child(even){background:#fafafa}
      </style></head><body>
        <h2>Staff Directory — SAK Schools</h2>
        <p>${escapeHtml(filterDesc || 'All records')} &nbsp;|&nbsp; ${rows.length} staff</p>
        <table><thead><tr>
          <th>Staff No</th><th>Full Name</th><th>Gender</th><th>Phone</th><th>Job Title</th><th>Station</th><th>Status</th>
        </tr></thead><tbody>
        ${rows.map(e =>
          `<tr>
            <td>${escapeHtml(e.staff_no)}</td>
            <td>${escapeHtml([e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' '))}</td>
            <td style="text-transform:capitalize">${escapeHtml(e.gender)}</td>
            <td>${escapeHtml(e.phone)}</td>
            <td>${escapeHtml(e.job_title)}</td>
            <td>${escapeHtml(e.campus_name)}</td>
            <td>${e.is_active ? 'Active' : 'Inactive'}</td>
          </tr>`
        ).join('')}
        </tbody></table>
      </body></html>`;

      const w = window.open('', '_blank');
      if (w) { writePrintDocument(w, html); w.focus(); w.print(); }
    } finally {
      setIsPrinting(false);
    }
  }

  const raw = data as any;
  const employees: Employee[] = (Array.isArray(raw) ? raw : raw?.data ?? []);
  const total: number = raw?.total ?? employees.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilter = search || gender || campusId || status !== 'active' || subject || classId;

  function clearFilters() {
    setSearch(''); setGender(''); setCampusId(''); setStatus('active'); setSubject(''); setClassId(''); setPage(1);
  }

  // Page numbers to show (up to 7 slots)
  function pageNumbers() {
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) range.push(i);
    if (range[0] > 1) { range.unshift(-1); range.unshift(1); }
    if (range[range.length - 1] < totalPages) { range.push(-2); range.push(totalPages); }
    return range;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Staff Directory</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {total} record{total !== 1 ? 's' : ''}{hasActiveFilter ? ' matched' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={printList}
            disabled={isPrinting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            <Printer size={14} /> {isPrinting ? 'Preparing…' : 'Print'}
          </button>
          {hasPermission('staff_profiles', 'create') && (
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-emerald-500 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
            >
              <Link2 size={14} /> Invite Staff
            </button>
          )}
          {hasPermission('staff_profiles', 'create') && (
            <button className="btn-primary shrink-0" onClick={() => navigate('/employees/new')}>
              <UserPlus size={16} /> Add Staff
            </button>
          )}
        </div>
      </div>

      {/* Filter bar — always visible */}
      <div className="card space-y-3">
          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-8 text-sm"
                placeholder="Name, Staff No, Phone…"
                value={search}
                onChange={e => applyFilter(() => setSearch(e.target.value))}
              />
            </div>
            {/* Gender */}
            <select
              className="input text-sm w-36"
              value={gender}
              onChange={e => applyFilter(() => setGender(e.target.value))}
            >
              <option value="">All Genders</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
            {/* Station */}
            <select
              className="input text-sm flex-1 min-w-[180px]"
              value={campusId}
              onChange={e => applyFilter(() => setCampusId(e.target.value))}
            >
              <option value="">All Stations</option>
              {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {/* Status */}
            <select
              className="input text-sm w-36"
              value={status}
              onChange={e => applyFilter(() => setStatus(e.target.value))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All Status</option>
            </select>
            {/* Subject */}
            <input
              className="input text-sm w-40"
              placeholder="Filter by subject…"
              value={subject}
              onChange={e => applyFilter(() => setSubject(e.target.value))}
            />
            {/* Class */}
            <select
              className="input text-sm w-40"
              value={classId}
              onChange={e => applyFilter(() => setClassId(e.target.value))}
            >
              <option value="">All Classes</option>
              {allClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {hasActiveFilter && (
              <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-2 text-sm text-slate-500 hover:text-red-500 transition-colors">
                <X size={14} /> Clear
              </button>
            )}
          </div>
        </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
              <tr>
                {['Staff No', 'Full Name', 'Gender', 'Phone', 'Job Title', 'Station', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {isLoading && (
                <tr><td colSpan={8} className="text-center py-10 text-slate-500">Loading…</td></tr>
              )}
              {!isLoading && !employees.length && (
                <tr><td colSpan={8} className="text-center py-10 text-slate-500">No staff records found</td></tr>
              )}
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 text-brand-400 font-mono text-xs">{emp.staff_no}</td>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                    {emp.first_name} {emp.middle_name ? `${emp.middle_name} ` : ''}{emp.last_name}
                  </td>
                  <td className="px-4 py-3 text-slate-400 capitalize">{emp.gender}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{emp.phone}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{emp.job_title ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{emp.campus_name ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3">
                    {emp.is_active
                      ? <span className="badge-active">Active</span>
                      : <span className="badge-inactive">Inactive</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/employees/${emp.id}`)} className="p-1.5 text-slate-500 hover:text-brand-400 transition-colors" title="View profile">
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-400">
              Showing {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded text-slate-500 hover:text-brand-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              ><ChevronLeft size={15} /></button>

              {pageNumbers().map((n, i) =>
                n < 0
                  ? <span key={`ellipsis-${i}`} className="px-1 text-slate-400 text-xs">…</span>
                  : <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`min-w-[28px] h-7 rounded text-xs font-medium transition-colors ${
                        n === page
                          ? 'bg-brand-600 text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >{n}</button>
              )}

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded text-slate-500 hover:text-brand-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              ><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>

      {showInvite && <InviteStaffModal onClose={() => setShowInvite(false)} />}
    </div>
  );
}

// ── InviteStaffModal ─────────────────────────────────────────────────────────

function InviteStaffModal({ onClose }: { onClose: () => void }) {
  const [whatsapp, setWhatsapp] = useState('');
  const [name, setName] = useState('');
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [serverBase, setServerBase] = useState('http://localhost:4000');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.sakAPI.serverInfo().then(info => setServerBase(info.baseUrl)).catch(() => {});
  }, []);

  const generateMut = useMutation({
    mutationFn: () => window.sakAPI.onboarding.generateLink(whatsapp.trim(), name.trim() || undefined),
    onSuccess: (data) => setGeneratedToken(data.token),
  });

  const link = generatedToken ? `${serverBase}/onboarding/${generatedToken}` : null;

  function copyLink() {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  }

  function shareWhatsApp() {
    if (!link) return;
    const greeting = name.trim() ? `Hello ${name.trim()},` : 'Hello,';
    const msg = encodeURIComponent(
      `${greeting}\n\nSAK Schools HR has invited you to submit your staff registration. Please click the link below to fill in your details (this link can only be used once):\n\n${link}\n\n\u2014 SAK Schools HR`
    );
    const number = whatsapp.trim().replace(/^0/, '256').replace(/\s+/g, '');
    window.open(`https://wa.me/${number}?text=${msg}`, '_blank');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-emerald-500" />
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Invite New Staff</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {!generatedToken ? (
            <>
              <p className="text-sm text-slate-500">Enter the candidate's WhatsApp number. They will receive a one-time registration link to fill in their details. HR will review and activate their profile after submission.</p>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">WhatsApp Number *</label>
                <input
                  className="input w-full"
                  type="tel"
                  placeholder="e.g. 0700 123456 or +256 700 123456"
                  value={whatsapp}
                  onChange={e => setWhatsapp(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Candidate Name <span className="font-normal normal-case">(optional — for reference)</span></label>
                <input
                  className="input w-full"
                  type="text"
                  placeholder="e.g. Mayega Mustafa"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              {generateMut.isError && (
                <p className="text-sm text-red-500">{(generateMut.error as any)?.response?.data?.error || 'Failed to generate link'}</p>
              )}

              <button
                className="btn-primary w-full"
                disabled={!whatsapp.trim() || generateMut.isPending}
                onClick={() => generateMut.mutate()}
              >
                <Link2 size={14} /> {generateMut.isPending ? 'Generating…' : 'Generate Registration Link'}
              </button>
            </>
          ) : (
            <>
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 text-center">
                <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2" />
                <p className="font-semibold text-emerald-700 dark:text-emerald-300">Link Generated!</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Valid for 30 days · Single use only</p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Registration Link</p>
                <p className="text-xs font-mono text-slate-600 dark:text-slate-300 break-all">{link}</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={copyLink}
                  className="flex-1 flex items-center justify-center gap-2 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {copied ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Link2 size={14} />}
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                  onClick={shareWhatsApp}
                  className="flex-1 flex items-center justify-center gap-2 py-2 text-sm bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Send via WhatsApp
                </button>
              </div>

              <button
                onClick={() => { setGeneratedToken(null); setWhatsapp(''); setName(''); }}
                className="w-full text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                Generate Another Link
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}