import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { formatDate } from '@sak/shared';
import { useAuthStore } from '../store/authStore';

interface Campus  { id: string; name: string }
interface Employee { id: string; first_name: string; last_name: string; staff_no: string }
interface Department { id: string; name: string; campus_id: string }

const EMPTY_FORM = {
  employeeId: '', type: 'transfer' as const,
  fromCampusId: '', toCampusId: '',
  fromDepartmentId: '', toDepartmentId: '',
  fromJobTitle: '', toJobTitle: '',
  effectiveDate: new Date().toISOString().slice(0, 10),
  reason: '', notes: '',
};

export default function TransfersPage() {
  const { hasPermission } = useAuthStore();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErr, setFormErr] = useState('');

  const canCreate  = hasPermission('transfers', 'create');
  const canApprove = hasPermission('transfers', 'approve');

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

  const transfers = data as {
    id: string; type: string; status: string;
    employee_name: string; staff_no: string;
    from_campus_name: string; to_campus_name: string;
    effective_date: string; reason: string;
  }[];

  const createTransfer = useMutation({
    mutationFn: () => window.sakAPI.transfers.create({
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
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      setShowModal(false);
      setForm(EMPTY_FORM);
      setFormErr('');
    },
    onError: (e: any) => setFormErr(e?.response?.data?.message ?? 'Create failed'),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approved' | 'rejected' }) =>
      window.sakAPI.transfers.approve(id, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfers'] }),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const fromDepts = allDepts.filter((d) => d.campus_id === form.fromCampusId);
  const toDepts   = allDepts.filter((d) => d.campus_id === form.toCampusId);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Transfers & Promotions</h1>
          <p className="text-slate-400 text-sm mt-0.5">Deployment history across all stations</p>
        </div>
        {canCreate && (
          <button className="btn-primary shrink-0" onClick={() => { setFormErr(''); setShowModal(true); }}>
            <Plus size={16} /> Add Transfer
          </button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
              <tr>
                {['Staff', 'Type', 'From', 'To', 'Effective Date', 'Status', canApprove ? 'Actions' : ''].filter(Boolean).map((h) => (
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
                    <span className={`badge-${t.status === 'approved' ? 'approved' : t.status === 'pending' ? 'pending' : 'inactive'}`}>
                      {t.status}
                    </span>
                  </td>
                  {canApprove && (
                    <td className="px-4 py-3">
                      {t.status === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => approveMutation.mutate({ id: t.id, action: 'approved' })}
                            className="text-xs px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded">
                            Approve
                          </button>
                          <button onClick={() => approveMutation.mutate({ id: t.id, action: 'rejected' })}
                            className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded">
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add Transfer Modal ──────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">New Transfer / Promotion</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none">&times;</button>
            </div>
            <form className="p-5 space-y-4" onSubmit={(e) => { e.preventDefault(); createTransfer.mutate(); }}>
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
                    onChange={(e) => setForm((f) => ({ ...f, fromCampusId: e.target.value, fromDepartmentId: '' }))}>                    
                    <option value="">— Station —</option>
                    {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">To Station *</label>
                  <select className="input" required value={form.toCampusId}
                    onChange={(e) => setForm((f) => ({ ...f, toCampusId: e.target.value, toDepartmentId: '' }))}>                    
                    <option value="">— Station —</option>
                    {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">From Dept</label>
                  <select className="input" value={form.fromDepartmentId} onChange={set('fromDepartmentId')}>
                    <option value="">— Dept —</option>
                    {fromDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">To Dept</label>
                  <select className="input" value={form.toDepartmentId} onChange={set('toDepartmentId')}>
                    <option value="">— Dept —</option>
                    {toDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">From Job Title</label>
                  <input className="input" value={form.fromJobTitle} onChange={set('fromJobTitle')} />
                </div>
                <div>
                  <label className="label">To Job Title</label>
                  <input className="input" value={form.toJobTitle} onChange={set('toJobTitle')} />
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
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={createTransfer.isPending}>
                  {createTransfer.isPending ? 'Saving…' : 'Submit Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
