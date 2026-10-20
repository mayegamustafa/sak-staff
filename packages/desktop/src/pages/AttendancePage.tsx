import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus, Pencil, Trash2, X, TableProperties, TrendingUp } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import AnalyticsDashboard from '../components/AnalyticsDashboard';

// ── Types ─────────────────────────────────────────────────────────────────────
interface AbsenceDetail {
  id?: string;
  reason: string;
  days: number;
  notes?: string;
}

interface AttendanceRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  staff_no: string;
  year: number;
  term: 'I' | 'II' | 'III';
  weeks: number;
  school_type: 'DAY' | 'BOARDING';
  days_present: number;
  expected_days: number;
  days_absent: number;
  attendance_percentage: number;
  rating: string;
  notes?: string;
  absence_details: AbsenceDetail[];
}

interface Employee { id: string; first_name: string; last_name: string; staff_no: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const ratingColor = (r: string) => {
  if (r === 'EXCELLENT') return 'bg-emerald-100 text-emerald-700';
  if (r === 'GOOD')      return 'bg-blue-100 text-blue-700';
  if (r === 'FAIR')      return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
};

const DEFAULT_REASONS = ['Sick Leave', 'Official Duty', 'Personal Leave', 'Maternity Leave', 'Unauthorised'];

interface RecordFormState {
  employeeId: string;
  year: string;
  term: 'I' | 'II' | 'III';
  weeks: string;
  schoolType: 'DAY' | 'BOARDING';
  daysPresent: string;
  daysAbsent: string;
  notes: string;
  absences: { reason: string; days: string; notes: string }[];
}

const EMPTY_FORM: RecordFormState = {
  employeeId: '',
  year: String(new Date().getFullYear()),
  term: 'I',
  weeks: '13',
  schoolType: 'DAY',
  daysPresent: '',
  daysAbsent: '',
  notes: '',
  absences: DEFAULT_REASONS.map((r) => ({ reason: r, days: '0', notes: '' })),
};

// ── Modal Shell ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode; }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 rounded-t-xl z-10">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE ROOT
// ═══════════════════════════════════════════════════════════════════════════════
export default function AttendancePage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuthStore();
  const canEdit = hasPermission('attendance', 'create') || hasPermission('attendance', 'update');

  const [activeTab, setActiveTab] = useState<'records' | 'analytics'>('records');

  const [filterYear, setFilterYear] = useState('');
  const [filterTerm, setFilterTerm] = useState('');
  const [filterStaff, setFilterStaff] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [form, setForm] = useState<RecordFormState>(EMPTY_FORM);
  const [err, setErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<AttendanceRecord | null>(null);

  const { data: records = [] } = useQuery<AttendanceRecord[]>({
    queryKey: ['attendance-records', filterYear, filterTerm, filterStaff],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (filterYear)  params.year    = filterYear;
      if (filterTerm)  params.term    = filterTerm;
      if (filterStaff) params.staffId = filterStaff;
      return window.sakAPI.attendance.listRecords(params) as Promise<AttendanceRecord[]>;
    },
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees-list'],
    queryFn: async () => {
      const res = await window.sakAPI.employees.list({ limit: 500 }) as any;
      return (res?.data ?? res) as Employee[];
    },
  });

  // Expected days computed from form values
  const expectedDays = form.weeks ? Number(form.weeks) * (form.schoolType === 'BOARDING' ? 7 : 6) : 0;
  const totalAbsent = form.absences.reduce((s, a) => s + (parseInt(a.days) || 0), 0);
  const daysPresent = form.daysPresent !== '' ? parseInt(form.daysPresent) : (expectedDays - totalAbsent);
  const daysAbsent = form.daysAbsent !== '' ? parseInt(form.daysAbsent) : totalAbsent;
  const attendancePct = expectedDays > 0 ? ((daysPresent / expectedDays) * 100).toFixed(1) : '0.0';

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

  const save = useMutation({
    mutationFn: (data: unknown) => editing
      ? window.sakAPI.attendance.updateRecord(editing.id, data)
      : window.sakAPI.attendance.createRecord(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance-records'] }); closeForm(); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? e?.message ?? 'Save failed'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => window.sakAPI.attendance.deleteRecord(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance-records'] }); setConfirmDelete(null); },
    onError: (e: any) => alert(e?.response?.data?.message ?? e?.message ?? 'Delete failed'),
  });

  function openAdd() {
    setEditing(null);
    setErr('');
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(rec: AttendanceRecord) {
    setEditing(rec);
    setErr('');
    // Build absence rows: start with existing ones, then fill in defaults that aren't present
    const existingReasons = rec.absence_details.map((a) => a.reason);
    const extraDefaults = DEFAULT_REASONS.filter((r) => !existingReasons.includes(r));
    const absences = [
      ...rec.absence_details.map((a) => ({ reason: a.reason, days: String(a.days), notes: a.notes ?? '' })),
      ...extraDefaults.map((r) => ({ reason: r, days: '0', notes: '' })),
    ];
    setForm({
      employeeId: rec.employee_id,
      year: String(rec.year),
      term: rec.term,
      weeks: String(rec.weeks),
      schoolType: rec.school_type,
      daysPresent: String(rec.days_present),
      daysAbsent: String(rec.days_absent),
      notes: rec.notes ?? '',
      absences,
    });
    setShowForm(true);
  }

  function closeForm() { setShowForm(false); setEditing(null); }

  function updateAbsence(idx: number, field: 'reason' | 'days' | 'notes', val: string) {
    setForm((f) => {
      const absences = [...f.absences];
      absences[idx] = { ...absences[idx], [field]: val };
      return { ...f, absences };
    });
  }

  function addAbsenceRow() {
    setForm((f) => ({ ...f, absences: [...f.absences, { reason: '', days: '0', notes: '' }] }));
  }

  function removeAbsenceRow(idx: number) {
    setForm((f) => ({ ...f, absences: f.absences.filter((_, i) => i !== idx) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing && !form.employeeId) { setErr('Please select a staff member'); return; }
    if (!form.year || !form.weeks) { setErr('Year and weeks are required'); return; }
    if (form.daysPresent === '' && form.daysAbsent === '') { setErr('Enter either Days Present or Days Absent'); return; }

    const absences = form.absences
      .filter((a) => parseInt(a.days) > 0 && a.reason.trim())
      .map((a) => ({ reason: a.reason.trim(), days: parseInt(a.days), notes: a.notes.trim() || undefined }));

    // Resolve daysPresent: prefer entered value, fall back to expectedDays - daysAbsent
    const expDays = parseInt(form.weeks) * (form.schoolType === 'BOARDING' ? 7 : 6);
    const resolvedPresent = form.daysPresent !== ''
      ? parseInt(form.daysPresent)
      : Math.max(0, expDays - parseInt(form.daysAbsent || '0'));

    const payload: Record<string, unknown> = {
      year: parseInt(form.year),
      term: form.term,
      weeks: parseInt(form.weeks),
      schoolType: form.schoolType,
      daysPresent: resolvedPresent,
      notes: form.notes.trim() || undefined,
      absences,
    };

    if (!editing) payload.employeeId = form.employeeId;

    save.mutate(payload);
  }

  const years = Array.from(new Set((records as AttendanceRecord[]).map((r) => r.year))).sort((a, b) => b - a);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <CalendarDays size={22} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Staff Attendance</h1>
          <p className="text-sm text-slate-500">Track and manage staff attendance records by academic term</p>
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('records')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'records'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <TableProperties size={15} />
          Records
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'analytics'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <TrendingUp size={15} />
          Analytics
        </button>
      </div>

      {/* ── Analytics Tab ── */}
      {activeTab === 'analytics' && (
        <AnalyticsDashboard embedded />
      )}

      {/* ── Records Tab ── */}
      {activeTab === 'records' && (<>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="label text-xs">Year</label>
          <select className="input text-sm py-1.5" value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            <option value="">All Years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs">Term</label>
          <select className="input text-sm py-1.5" value={filterTerm} onChange={(e) => setFilterTerm(e.target.value)}>
            <option value="">All Terms</option>
            <option value="I">Term I</option>
            <option value="II">Term II</option>
            <option value="III">Term III</option>
          </select>
        </div>
        <div>
          <label className="label text-xs">Staff</label>
          <select className="input text-sm py-1.5" value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)}>
            <option value="">All Staff</option>
            {(employees as Employee[]).map((e) => (
              <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.staff_no})</option>
            ))}
          </select>
        </div>
        <div className="ml-auto">
          {canEdit && (
            <button onClick={openAdd} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Add Record
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Staff</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Year</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Term</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Type</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Expected</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Present</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Absent</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600 dark:text-slate-400">%</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Rating</th>
                {canEdit && <th className="py-3 px-4"></th>}
              </tr>
            </thead>
            <tbody>
              {(records as AttendanceRecord[]).map((r) => (
                <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{r.employee_name}</div>
                    <div className="text-xs text-slate-400">{r.staff_no}</div>
                  </td>
                  <td className="py-3 px-4">{r.year}</td>
                  <td className="py-3 px-4">Term {r.term}</td>
                  <td className="py-3 px-4 text-xs text-slate-500">{r.school_type}</td>
                  <td className="py-3 px-4 text-right">{r.expected_days}</td>
                  <td className="py-3 px-4 text-right text-emerald-600 font-medium">{r.days_present}</td>
                  <td className="py-3 px-4 text-right text-red-500">{r.days_absent}</td>
                  <td className="py-3 px-4 text-right font-medium">{Number(r.attendance_percentage).toFixed(1)}%</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ratingColor(r.rating)}`}>{r.rating}</span>
                  </td>
                  {canEdit && (
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openEdit(r)} className="text-slate-400 hover:text-blue-600"><Pencil size={14} /></button>
                        <button onClick={() => setConfirmDelete(r)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {(records as AttendanceRecord[]).length === 0 && (
                <tr><td colSpan={canEdit ? 10 : 9} className="py-8 text-center text-slate-400">No attendance records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <Modal title={editing ? `Edit Record — ${editing.employee_name}` : 'Add Attendance Record'} onClose={closeForm}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {err && <p className="text-red-600 text-sm">{err}</p>}

            {!editing && (
              <div>
                <label className="label">Staff Member *</label>
                <select className="input" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                  <option value="">— select staff —</option>
                  {(employees as Employee[]).map((e) => (
                    <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.staff_no})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Academic Year *</label>
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
                <label className="label">Term Weeks *</label>
                <input type="number" className="input" value={form.weeks} onChange={(e) => setForm({ ...form, weeks: e.target.value })} min={1} max={52} />
              </div>
            </div>

            {expectedDays > 0 && (
              <p className="text-sm text-slate-500">Expected days this term: <strong>{expectedDays}</strong></p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Days Present</label>
                <input type="number" className="input" value={form.daysPresent} onChange={(e) => handleDaysPresentChange(e.target.value)} min={0} max={expectedDays || 999} placeholder="e.g. 75" />
                <p className="text-xs text-slate-400 mt-1">Auto-fills Days Absent</p>
              </div>
              <div>
                <label className="label">Days Absent</label>
                <input type="number" className="input" value={form.daysAbsent} onChange={(e) => handleDaysAbsentChange(e.target.value)} min={0} max={expectedDays || 999} placeholder="e.g. 5" />
                <p className="text-xs text-slate-400 mt-1">Auto-fills Days Present</p>
              </div>
            </div>

            {/* Absence breakdown */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Absence Breakdown by Reason</label>
                <button type="button" onClick={addAbsenceRow} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  <Plus size={12} /> Add row
                </button>
              </div>
              <div className="space-y-2">
                {form.absences.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className="input flex-1"
                      placeholder="Reason"
                      value={a.reason}
                      onChange={(e) => updateAbsence(i, 'reason', e.target.value)}
                    />
                    <input
                      type="number"
                      className="input w-20 text-right"
                      min={0}
                      value={a.days}
                      onChange={(e) => updateAbsence(i, 'days', e.target.value)}
                    />
                    <span className="text-xs text-slate-400 w-6">days</span>
                    <button type="button" onClick={() => removeAbsenceRow(i)} className="text-slate-300 hover:text-red-500">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Live summary */}
            {expectedDays > 0 && (
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-slate-600">Expected days:</span><span className="font-medium">{expectedDays}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Absent (breakdown total):</span><span className="font-medium">{totalAbsent}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Days present:</span><span className="font-medium text-emerald-600">{form.daysPresent || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Days absent:</span><span className="font-medium text-red-500">{form.daysAbsent || daysAbsent || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Attendance %:</span><span className="font-medium">{attendancePct}%</span></div>
              </div>
            )}

            <div>
              <label className="label">Notes</label>
              <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={closeForm} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <Modal title="Delete Record" onClose={() => setConfirmDelete(null)}>
          <p className="text-slate-700 dark:text-slate-300 mb-6">
            Delete attendance record for <strong>{confirmDelete.employee_name}</strong> (Term {confirmDelete.term} {confirmDelete.year})?
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmDelete(null)} className="btn-secondary">Cancel</button>
            <button onClick={() => remove.mutate(confirmDelete.id)} className="btn-primary bg-red-600 hover:bg-red-700" disabled={remove.isPending}>
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
      </>)}{/* /records tab */}
    </div>
  );
}
