import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Plus, Pencil, Trash2, Users, DollarSign,
  Calendar, X, Filter, ChevronDown
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

// ── Types ──────────────────────────────────────────────────────────────────────
interface TrainingRecord {
  id: string;
  employee_id: string;
  title: string;
  type: TrainingType;
  provider: string;
  venue?: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  skills: string[] | string;
  cost?: number | null;
  currency: string;
  payment_by?: string | null;
  notes?: string | null;
}
type TrainingType = 'workshop' | 'seminar' | 'course' | 'conference' | 'on_the_job' | 'online';

const TRAINING_TYPES: { value: TrainingType; label: string }[] = [
  { value: 'workshop',    label: 'Workshop' },
  { value: 'seminar',     label: 'Seminar' },
  { value: 'course',      label: 'Course' },
  { value: 'conference',  label: 'Conference' },
  { value: 'on_the_job',  label: 'On-the-Job Training' },
  { value: 'online',      label: 'Online / eLearning' },
];

const PAYMENT_BY = [
  { value: 'employer',  label: 'Employer' },
  { value: 'employee',  label: 'Employee (self-funded)' },
  { value: 'sponsored', label: 'Sponsored / Grant' },
];

const typeLabel = (t: string) => TRAINING_TYPES.find((x) => x.value === t)?.label ?? t;

const typeColor = (t: TrainingType) => {
  const map: Record<TrainingType, string> = {
    workshop:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    seminar:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    course:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    conference: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    on_the_job: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    online:     'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  };
  return map[t] ?? 'bg-slate-100 text-slate-600';
};

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY_FORM = {
  employeeId: '', title: '', type: 'workshop' as TrainingType,
  provider: '', venue: '', startDate: today(), endDate: today(),
  durationDays: 1, skillsRaw: '', cost: '', currency: 'UGX',
  paymentBy: 'employer' as string, notes: '',
};

// ── Modal shell ────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 rounded-t-xl z-10">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function TrainingPage() {
  const qc = useQueryClient();
  const { hasPermission, user } = useAuthStore();
  const canWrite = user?.role?.slug === 'super_admin'
    || hasPermission('training', 'create')
    || hasPermission('training', 'update');

  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterType, setFilterType] = useState('');
  const [modal, setModal] = useState<null | { mode: 'add' | 'edit'; data: typeof EMPTY_FORM & { id?: string } }>(null);
  const [err, setErr] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: allRecords = [], isLoading } = useQuery<TrainingRecord[]>({
    queryKey: ['training'],
    queryFn: () => window.sakAPI.training.list() as Promise<TrainingRecord[]>,
  });

  const { data: employees = [] } = useQuery<{ id: string; first_name: string; last_name: string; staff_no: string }[]>({
    queryKey: ['employees-slim'],
    queryFn: async () => {
      const res = await window.sakAPI.employees.list({ limit: 500 }) as any;
      return Array.isArray(res) ? res : (res.data ?? []);
    },
  });

  // Filter
  const records = allRecords
    .filter((r) => !filterEmployee || r.employee_id === filterEmployee)
    .filter((r) => !filterType || r.type === filterType);

  // Stats
  const totalCost = allRecords.reduce((sum, r) => sum + (Number(r.cost) || 0), 0);
  const uniqueParticipants = new Set(allRecords.map((r) => r.employee_id)).size;

  const typeBreakdown = TRAINING_TYPES.map((t) => ({
    ...t,
    count: allRecords.filter((r) => r.type === t.value).length,
  })).filter((t) => t.count > 0);

  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.first_name} ${e.last_name}` : '—';
  };

  const parseSkills = (s: string[] | string): string[] => {
    if (Array.isArray(s)) return s;
    try { return JSON.parse(s || '[]'); } catch { return []; }
  };

  // ── Mutations ──────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async (m: typeof modal) => {
      if (!m) return;
      const skills = m.data.skillsRaw.split(',').map((s) => s.trim()).filter(Boolean);
      const payload = {
        employeeId: m.data.employeeId,
        title: m.data.title,
        type: m.data.type,
        provider: m.data.provider,
        venue: m.data.venue || undefined,
        startDate: m.data.startDate,
        endDate: m.data.endDate,
        durationDays: Number(m.data.durationDays),
        skills,
        cost: m.data.cost ? Number(m.data.cost) : undefined,
        currency: m.data.currency,
        paymentBy: m.data.paymentBy || undefined,
        notes: m.data.notes || undefined,
      };
      return m.mode === 'edit' && m.data.id
        ? window.sakAPI.training.update(m.data.id, payload)
        : window.sakAPI.training.create(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['training'] }); setModal(null); setErr(''); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Save failed'),
  });

  const del = useMutation({
    mutationFn: (id: string) => window.sakAPI.training.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training'] }),
  });

  const openAdd = () => {
    setErr('');
    setModal({ mode: 'add', data: { ...EMPTY_FORM } });
  };

  const openEdit = (r: TrainingRecord) => {
    setErr('');
    setModal({
      mode: 'edit', data: {
        id: r.id,
        employeeId: r.employee_id,
        title: r.title,
        type: r.type,
        provider: r.provider,
        venue: r.venue ?? '',
        startDate: r.start_date?.slice(0, 10) ?? today(),
        endDate: r.end_date?.slice(0, 10) ?? today(),
        durationDays: r.duration_days,
        skillsRaw: parseSkills(r.skills).join(', '),
        cost: r.cost ? String(r.cost) : '',
        currency: r.currency ?? 'UGX',
        paymentBy: r.payment_by ?? 'employer',
        notes: r.notes ?? '',
      },
    });
  };

  const setField = (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setModal((m) => m && ({ ...m, data: { ...m.data, [field]: e.target.value } }));

  const setDate = (field: 'startDate' | 'endDate') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setModal((m) => {
      if (!m) return m;
      const updated = { ...m.data, [field]: val };
      const s = new Date(field === 'startDate' ? val : updated.startDate);
      const e2 = new Date(field === 'endDate' ? val : updated.endDate);
      const diff = Math.max(1, Math.round((e2.getTime() - s.getTime()) / 86400000) + 1);
      return { ...m, data: { ...updated, durationDays: isNaN(diff) ? 1 : diff } };
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Training & Professional Development</h1>
          <p className="text-slate-400 text-sm mt-0.5">Workshops, courses and skills tracking</p>
        </div>
        {canWrite && (
          <button onClick={openAdd} className="btn-primary">
            <Plus size={15} /> Log Training
          </button>
        )}
      </div>

      {/* Stats */}
      {allRecords.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            { icon: BookOpen,   label: 'Total Records',   value: allRecords.length },
            { icon: Users,      label: 'Participants',    value: uniqueParticipants },
            { icon: Calendar,   label: 'This Year',       value: allRecords.filter((r) => r.start_date?.startsWith(new Date().getFullYear().toString())).length },
            { icon: DollarSign, label: 'Total Cost (UGX)', value: totalCost > 0 ? totalCost.toLocaleString() : '—' },
          ]).map(({ icon: Icon, label, value }) => (
            <div key={label} className="card flex items-center gap-3 py-3">
              <div className="w-8 h-8 bg-brand-100 dark:bg-brand-900/40 rounded-lg flex items-center justify-center shrink-0">
                <Icon size={15} className="text-brand-600 dark:text-brand-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-none mb-0.5">{label}</p>
                <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Type breakdown */}
      {typeBreakdown.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {typeBreakdown.map((t) => (
            <button
              key={t.value}
              onClick={() => setFilterType(filterType === t.value ? '' : t.value)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors font-medium ${typeColor(t.value)} ${filterType === t.value ? 'ring-2 ring-brand-500' : ''}`}
            >
              {t.label} <span className="opacity-70">({t.count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setShowFilters((f) => !f)} className="btn-secondary text-xs">
          <Filter size={13} /> Filters {(filterEmployee || filterType) ? '·' : ''}
          <ChevronDown size={12} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
        {(filterEmployee || filterType) && (
          <button onClick={() => { setFilterEmployee(''); setFilterType(''); }} className="text-xs text-red-400 hover:underline flex items-center gap-1">
            <X size={12} /> Clear
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{records.length} record{records.length !== 1 ? 's' : ''}</span>
      </div>
      {showFilters && (
        <div className="card grid grid-cols-1 sm:grid-cols-2 gap-3 py-3">
          <div>
            <label className="label">Employee</label>
            <select className="input" value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}>
              <option value="">All staff</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.staff_no})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Training Type</label>
            <select className="input" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All types</option>
              {TRAINING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Records grid */}
      {isLoading && <p className="text-slate-500 text-sm">Loading…</p>}
      {!isLoading && allRecords.length === 0 && (
        <div className="card text-center py-12">
          <BookOpen size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">No training records yet</p>
          <p className="text-slate-400 text-sm">Log workshops, courses and professional development activities.</p>
          {canWrite && (
            <button onClick={openAdd} className="btn-primary mt-4 mx-auto">
              <Plus size={15} /> Log First Training
            </button>
          )}
        </div>
      )}
      {!isLoading && allRecords.length > 0 && records.length === 0 && (
        <p className="text-slate-400 text-sm">No records match the selected filters.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {records.map((r) => {
          const skills = parseSkills(r.skills);
          return (
            <div key={r.id} className="card space-y-3 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm leading-snug flex-1">{r.title}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 font-medium ${typeColor(r.type)}`}>
                  {typeLabel(r.type)}
                </span>
              </div>
              <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                <p className="font-medium text-slate-700 dark:text-slate-300">{empName(r.employee_id)}</p>
                <p>{r.provider}{r.venue ? ` — ${r.venue}` : ''}</p>
                <p>{r.start_date?.slice(0, 10)} → {r.end_date?.slice(0, 10)} ({r.duration_days} day{r.duration_days !== 1 ? 's' : ''})</p>
                {r.cost && (
                  <p className="text-brand-500 font-medium">
                    {r.currency} {Number(r.cost).toLocaleString()}{r.payment_by ? ` · ${r.payment_by}` : ''}
                  </p>
                )}
              </div>
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {skills.map((s) => (
                    <span key={s} className="text-[10px] px-2 py-0.5 bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 rounded-full">{s}</span>
                  ))}
                </div>
              )}
              {canWrite && (
                <div className="flex justify-end gap-1 pt-1 border-t border-slate-100 dark:border-slate-800 mt-auto">
                  <button onClick={() => openEdit(r)} className="p-1.5 text-slate-400 hover:text-brand-400 transition-colors rounded" title="Edit">
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => { if (confirm(`Delete training record "${r.title}"?`)) del.mutate(r.id); }}
                    className="p-1.5 text-slate-400 hover:text-red-400 transition-colors rounded" title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add / Edit Modal */}
      {modal && (
        <Modal title={modal.mode === 'add' ? 'Log Training Record' : 'Edit Training Record'} onClose={() => setModal(null)}>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(modal); }} className="space-y-4">
            <div>
              <label className="label">Staff Member *</label>
              <select className="input" required value={modal.data.employeeId} onChange={setField('employeeId')}>
                <option value="">— Select staff member —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.staff_no})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label">Training Title *</label>
                <input className="input" required placeholder="e.g. Child Protection Workshop" value={modal.data.title} onChange={setField('title')} />
              </div>
              <div>
                <label className="label">Type *</label>
                <select className="input" required value={modal.data.type} onChange={setField('type')}>
                  {TRAINING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Provider / Facilitator *</label>
                <input className="input" required placeholder="e.g. Uganda MoES, UNEB" value={modal.data.provider} onChange={setField('provider')} />
              </div>
            </div>

            <div>
              <label className="label">Venue / Platform</label>
              <input className="input" placeholder="e.g. Kampala, Zoom" value={modal.data.venue} onChange={setField('venue')} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Start Date *</label>
                <input className="input" type="date" required value={modal.data.startDate} onChange={setDate('startDate')} />
              </div>
              <div>
                <label className="label">End Date *</label>
                <input className="input" type="date" required value={modal.data.endDate} onChange={setDate('endDate')} />
              </div>
              <div>
                <label className="label">Days</label>
                <input className="input" type="number" min={1} value={modal.data.durationDays} onChange={setField('durationDays')} />
              </div>
            </div>

            <div>
              <label className="label">Skills Gained <span className="normal-case font-normal text-slate-400">(comma-separated)</span></label>
              <input className="input" placeholder="e.g. Child Safety, Curriculum Design, ICT" value={modal.data.skillsRaw} onChange={setField('skillsRaw')} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="label">Cost (optional)</label>
                <input className="input" type="number" min={0} placeholder="0" value={modal.data.cost} onChange={setField('cost')} />
              </div>
              <div>
                <label className="label">Currency</label>
                <select className="input" value={modal.data.currency} onChange={setField('currency')}>
                  {['UGX', 'USD', 'KES', 'TZS', 'EUR', 'GBP'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Paid by</label>
              <select className="input" value={modal.data.paymentBy} onChange={setField('paymentBy')}>
                <option value="">— Not specified —</option>
                {PAYMENT_BY.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Notes</label>
              <textarea className="input resize-none" rows={2} placeholder="Any additional notes…" value={modal.data.notes} onChange={setField('notes')} />
            </div>

            {err && <p className="text-red-400 text-sm">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save Record'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

