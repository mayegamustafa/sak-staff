import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  Plus, Pencil, Trash2, X, Users, TrendingDown, TrendingUp, Settings2
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

// ── Types ─────────────────────────────────────────────────────────────────────
interface GapItem {
  establishment_id: string | null;
  job_title_id: string | null;
  job_title: string;
  category: string;
  required: number;
  filled: number;
  gap: number;
}
interface CampusGap {
  campus_id: string;
  campus_name: string;
  campus_code: string;
  total_required: number;
  total_filled: number;
  items: GapItem[];
}
interface EstRow {
  id: string;
  campus_id: string; campus_name: string; campus_code: string;
  job_title_id: string; job_title: string; category: string;
  required_count: number; notes: string | null;
}
interface JobTitle {
  id: string; title: string; category: string; pay_grade: string | null; is_active: boolean;
}
interface Campus {
  id: string; name: string; code: string;
}

const CAT_LABEL: Record<string, string> = {
  teaching_staff: 'Teaching Staff',
  non_teaching_professional: 'Professional Non-Teaching',
  support_staff: 'Support Staff',
  administrator: 'Administrator',
  manager: 'Manager',
};

const CAT_COLOR: Record<string, string> = {
  teaching_staff: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  non_teaching_professional: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  support_staff: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  administrator: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  manager: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

// ── Bar component ─────────────────────────────────────────────────────────────
function FillBar({ filled, required }: { filled: number; required: number }) {
  if (required === 0) {
    return <span className="text-xs text-slate-400 italic">unplanned</span>;
  }
  const pct = Math.min(100, Math.round((filled / required) * 100));
  const color = pct >= 100 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 flex-1 overflow-hidden min-w-[60px]">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs tabular-nums shrink-0 font-medium ${
        pct >= 100 ? 'text-emerald-500' : pct >= 75 ? 'text-amber-500' : 'text-red-400'
      }`}>{filled}/{required}</span>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 rounded-t-xl z-10">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StaffGapsPage() {
  const qc = useQueryClient();
  const { hasPermission, user } = useAuthStore();
  const canWrite = user?.role?.slug === 'super_admin'
    || hasPermission('campus_management', 'create')
    || hasPermission('campus_management', 'update');

  const [expandedCampus, setExpandedCampus] = useState<Set<string>>(new Set());
  const [filterCampus, setFilterCampus] = useState('');
  const [showManage, setShowManage] = useState(false);
  type ModalAdd  = { mode: 'add';  campusIds: string[]; jobTitleId: string; requiredCount: number; notes: string };
  type ModalEdit = { mode: 'edit'; id: string; campusId: string; jobTitleId: string; requiredCount: number; notes: string };
  const [modal, setModal] = useState<null | ModalAdd | ModalEdit>(null);
  const [err, setErr] = useState('');

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: gaps = [], isLoading } = useQuery<CampusGap[]>({
    queryKey: ['staffing-gaps'],
    queryFn: () => window.sakAPI.staffing.gaps() as Promise<CampusGap[]>,
  });

  const { data: establishment = [] } = useQuery<EstRow[]>({
    queryKey: ['staffing-establishment'],
    queryFn: () => window.sakAPI.staffing.listEstablishment() as Promise<EstRow[]>,
    enabled: showManage,
  });

  const { data: campuses = [] } = useQuery<Campus[]>({
    queryKey: ['campuses'],
    queryFn: () => window.sakAPI.campuses.list() as Promise<Campus[]>,
  });

  const { data: jobTitles = [] } = useQuery<JobTitle[]>({
    queryKey: ['job-titles'],
    queryFn: () => window.sakAPI.jobTitles.list() as Promise<JobTitle[]>,
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalRequired = gaps.reduce((s, c) => s + c.total_required, 0);
  const totalFilled   = gaps.reduce((s, c) => s + c.total_filled, 0);
  const totalGap      = totalRequired - totalFilled;
  const stationsWithGap = gaps.filter((c) => c.total_required > c.total_filled).length;

  // ── Mutations ──────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async (m: ModalAdd | ModalEdit | null) => {
      if (!m) return;
      if (m.mode === 'edit') {
        return window.sakAPI.staffing.updateEstablishment(m.id, { requiredCount: m.requiredCount, notes: m.notes || undefined });
      }
      // Add mode — upsert for each selected station in sequence
      for (const campusId of m.campusIds) {
        await window.sakAPI.staffing.createEstablishment({
          campusId,
          jobTitleId: m.jobTitleId,
          requiredCount: m.requiredCount,
          notes: m.notes || undefined,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staffing-gaps'] });
      qc.invalidateQueries({ queryKey: ['staffing-establishment'] });
      setModal(null); setErr('');
    },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Save failed'),
  });

  const del = useMutation({
    mutationFn: (id: string) => window.sakAPI.staffing.deleteEstablishment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staffing-gaps'] });
      qc.invalidateQueries({ queryKey: ['staffing-establishment'] });
    },
  });

  const toggleCampus = (id: string) => setExpandedCampus((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const filteredGaps = filterCampus
    ? gaps.filter((g) => g.campus_id === filterCampus)
    : gaps;

  const openAdd = () => {
    setErr('');
    setModal({ mode: 'add', campusIds: campuses.map((c) => c.id), jobTitleId: jobTitles[0]?.id ?? '', requiredCount: 1, notes: '' });
  };
  const openEdit = (row: EstRow) => {
    setErr('');
    setModal({ mode: 'edit', id: row.id, campusId: row.campus_id, jobTitleId: row.job_title_id, requiredCount: row.required_count, notes: row.notes ?? '' });
  };

  // Group establishment by campus for display
  const estByCampus = showManage
    ? establishment.reduce((map, row) => {
        if (!map.has(row.campus_id)) map.set(row.campus_id, { name: row.campus_name, rows: [] });
        map.get(row.campus_id)!.rows.push(row);
        return map;
      }, new Map<string, { name: string; rows: EstRow[] }>())
    : new Map<string, { name: string; rows: EstRow[] }>();

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Staff Gaps</h1>
          <p className="text-slate-400 text-sm mt-0.5">Staffing establishment vs actual headcount per station</p>
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <button onClick={() => setShowManage((v) => !v)} className={`btn-secondary text-xs gap-1.5 ${showManage ? 'ring-2 ring-brand-400' : ''}`}>
              <Settings2 size={14} /> {showManage ? 'Hide' : 'Manage'} Establishment
            </button>
          )}
        </div>
      </div>

      {/* Summary stats */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Users,         label: 'Total Filled',    value: totalFilled,       sub: `of ${totalRequired} planned` },
            { icon: TrendingDown,  label: 'Total Gap',       value: totalGap > 0 ? `-${totalGap}` : '0',  sub: totalGap > 0 ? 'positions vacant' : 'fully staffed', red: totalGap > 0 },
            { icon: AlertTriangle, label: 'Stations w/ Gap', value: stationsWithGap,   sub: `of ${gaps.length} stations`, amber: stationsWithGap > 0 },
            { icon: TrendingUp,    label: 'Overstaffed',     value: gaps.filter((c) => c.items.some((i) => i.gap < 0)).length, sub: 'stations above plan' },
          ].map(({ icon: Icon, label, value, sub, red, amber }) => (
            <div key={label} className="card flex items-center gap-3 py-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                red ? 'bg-red-100 dark:bg-red-900/40' : amber ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-brand-100 dark:bg-brand-900/40'
              }`}>
                <Icon size={15} className={red ? 'text-red-500' : amber ? 'text-amber-500' : 'text-brand-600 dark:text-brand-400'} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-none mb-0.5">{label}</p>
                <p className={`font-bold text-sm ${red ? 'text-red-500' : amber ? 'text-amber-500' : 'text-slate-900 dark:text-white'}`}>{value}</p>
                <p className="text-[10px] text-slate-400 leading-none mt-0.5">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalRequired === 0 && !isLoading && !showManage && (
        <div className="card text-center py-10">
          <Settings2 size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="font-medium text-slate-600 dark:text-slate-300 mb-1">No staffing establishment set up yet</p>
          <p className="text-slate-400 text-sm">Define how many staff are required for each job title at each station.</p>
          {canWrite && (
            <button onClick={() => setShowManage(true)} className="btn-primary mt-4 mx-auto">
              <Settings2 size={14} /> Set Up Establishment
            </button>
          )}
        </div>
      )}

      {/* Filter */}
      {gaps.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <select className="input text-xs py-1.5 w-auto" value={filterCampus} onChange={(e) => setFilterCampus(e.target.value)}>
            <option value="">All stations</option>
            {gaps.map((g) => <option key={g.campus_id} value={g.campus_id}>{g.campus_name}</option>)}
          </select>
          {filterCampus && (
            <button onClick={() => setFilterCampus('')} className="text-xs text-slate-400 hover:text-red-400 flex items-center gap-1">
              <X size={12} /> Clear
            </button>
          )}
        </div>
      )}

      {/* Gap cards per station */}
      {isLoading && <p className="text-slate-500 text-sm">Loading…</p>}
      {!isLoading && (
        <div className="space-y-3">
          {filteredGaps.map((campus) => {
            const pct = campus.total_required > 0 ? Math.round((campus.total_filled / campus.total_required) * 100) : null;
            const gapCount = campus.total_required - campus.total_filled;
            const expanded = expandedCampus.has(campus.campus_id);

            // Group items by category
            const byCategory = campus.items.reduce((map, item) => {
              if (!map.has(item.category)) map.set(item.category, []);
              map.get(item.category)!.push(item);
              return map;
            }, new Map<string, GapItem[]>());

            return (
              <div key={campus.campus_id} className="card p-0 overflow-hidden">
                {/* Campus header row */}
                <button
                  onClick={() => toggleCampus(campus.campus_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left"
                >
                  <div className="shrink-0">
                    {expanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{campus.campus_name}</span>
                      <span className="text-xs text-slate-400 font-mono">{campus.campus_code}</span>
                      {campus.total_required > 0 && (
                        gapCount > 0
                          ? <span className="text-xs text-red-500 font-medium flex items-center gap-0.5"><AlertTriangle size={11} /> {gapCount} vacant</span>
                          : <span className="text-xs text-emerald-500 font-medium flex items-center gap-0.5"><CheckCircle2 size={11} /> Fully staffed</span>
                      )}
                      {campus.items.some((i) => i.required === 0) && (
                        <span className="text-xs text-amber-500 font-medium">+ unplanned staff</span>
                      )}
                    </div>
                    <FillBar filled={campus.total_filled} required={campus.total_required} />
                  </div>
                  {pct !== null && (
                    <span className={`text-sm font-bold shrink-0 ${pct >= 100 ? 'text-emerald-500' : pct >= 75 ? 'text-amber-500' : 'text-red-400'}`}>
                      {pct}%
                    </span>
                  )}
                </button>

                {/* Expanded detail */}
                {expanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800">
                    {[...byCategory.entries()].map(([cat, items]) => (
                      <div key={cat}>
                        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLOR[cat] ?? 'bg-slate-100 text-slate-600'}`}>
                            {CAT_LABEL[cat] ?? cat}
                          </span>
                          <span className="text-xs text-slate-400">
                            {items.reduce((s, i) => s + i.filled, 0)}/{items.reduce((s, i) => s + i.required, 0)}
                          </span>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {items.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3 px-4 py-2">
                              <span className="text-sm text-slate-700 dark:text-slate-300 flex-1 min-w-0 truncate">{item.job_title}</span>
                              <FillBar filled={item.filled} required={item.required} />
                              {item.gap > 0 && (
                                <span className="text-xs text-red-400 font-semibold shrink-0 w-14 text-right">−{item.gap}</span>
                              )}
                              {item.gap < 0 && (
                                <span className="text-xs text-amber-400 font-semibold shrink-0 w-14 text-right">+{Math.abs(item.gap)}</span>
                              )}
                              {item.gap === 0 && item.required > 0 && (
                                <span className="text-xs text-emerald-500 shrink-0 w-14 text-right">✓</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Manage Establishment Panel ── */}
      {showManage && canWrite && (
        <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">Staffing Establishment</h2>
              <p className="text-xs text-slate-400 mt-0.5">Define how many of each role are required at each station</p>
            </div>
            <button onClick={openAdd} className="btn-primary text-xs">
              <Plus size={13} /> Add Entry
            </button>
          </div>

          {[...estByCampus.entries()].map(([campusId, { name, rows }]) => (
            <div key={campusId} className="card p-0 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800">
                <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">{name}</span>
                <span className="text-xs text-slate-400 ml-2">{rows.length} roles</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row: EstRow) => (
                  <div key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-slate-700 dark:text-slate-200">{row.job_title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ml-2 ${CAT_COLOR[row.category] ?? ''}`}>
                        {CAT_LABEL[row.category] ?? row.category}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 shrink-0">×{row.required_count}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEdit(row)} className="p-1.5 text-slate-400 hover:text-brand-400 rounded" title="Edit">
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Remove "${row.job_title}" from ${row.campus_name}?`)) del.mutate(row.id); }}
                        className="p-1.5 text-slate-400 hover:text-red-400 rounded" title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {estByCampus.size === 0 && (
            <div className="card text-center py-8 text-slate-400 text-sm">
              No establishment records yet. Click "Add Entry" to begin.
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal && (
        <Modal
          title={modal.mode === 'add' ? 'Add Establishment Entry' : `Edit — ${campuses.find((c) => c.id === (modal as any).campusId)?.name ?? ''}`}
          onClose={() => setModal(null)}
        >
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(modal); }} className="space-y-4">
            {modal.mode === 'add' ? (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label mb-0">Stations *</label>
                  <div className="flex gap-2 text-xs">
                    <button type="button" className="text-brand-500 hover:underline"
                      onClick={() => setModal((m) => m?.mode === 'add' ? { ...m, campusIds: campuses.map((c) => c.id) } : m)}>
                      All
                    </button>
                    <span className="text-slate-300 dark:text-slate-600">|</span>
                    <button type="button" className="text-slate-400 hover:underline"
                      onClick={() => setModal((m) => m?.mode === 'add' ? { ...m, campusIds: [] } : m)}>
                      None
                    </button>
                  </div>
                </div>
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                  {campuses.map((c) => {
                    const checked = modal.campusIds.includes(c.id);
                    return (
                      <label key={c.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <input type="checkbox" className="rounded" checked={checked}
                          onChange={() => setModal((m) => {
                            if (m?.mode !== 'add') return m;
                            const ids = checked
                              ? m.campusIds.filter((id) => id !== c.id)
                              : [...m.campusIds, c.id];
                            return { ...m, campusIds: ids };
                          })}
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-200">{c.name}</span>
                        <span className="text-xs text-slate-400 font-mono ml-auto">{(c as any).code}</span>
                      </label>
                    );
                  })}
                </div>
                {modal.campusIds.length === 0 && <p className="text-xs text-red-400 mt-1">Select at least one station</p>}
                <p className="text-xs text-slate-400 mt-1">{modal.campusIds.length} of {campuses.length} selected · existing entries will be updated</p>
              </div>
            ) : (
              <div>
                <label className="label">Station</label>
                <input className="input" disabled
                  value={campuses.find((c) => c.id === (modal as any).campusId)?.name ?? (modal as any).campusId} />
              </div>
            )}
            <div>
              <label className="label">Job Title *</label>
              <select className="input" required value={modal.jobTitleId}
                onChange={(e) => setModal((m) => m && ({ ...m, jobTitleId: e.target.value }))}
                disabled={modal.mode === 'edit'}
              >
                <option value="">— Select Job Title —</option>
                {Object.entries(
                  jobTitles.filter((j) => j.is_active).reduce((acc, jt) => {
                    (acc[jt.category] = acc[jt.category] || []).push(jt);
                    return acc;
                  }, {} as Record<string, JobTitle[]>)
                ).map(([cat, titles]) => (
                  <optgroup key={cat} label={CAT_LABEL[cat] ?? cat}>
                    {titles.map((jt) => <option key={jt.id} value={jt.id}>{jt.title}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Required Count *</label>
              <input
                className="input" type="number" min={0} max={999} required
                value={modal.requiredCount}
                onChange={(e) => setModal((m) => m && ({ ...m, requiredCount: Number(e.target.value) }))}
              />
              <p className="text-xs text-slate-400 mt-1">Set to 0 to mark as not required at this station</p>
            </div>
            <div>
              <label className="label">Notes</label>
              <input className="input" placeholder="Optional note…" value={modal.notes}
                onChange={(e) => setModal((m) => m && ({ ...m, notes: e.target.value }))} />
            </div>
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn-primary"
                disabled={save.isPending || (modal.mode === 'add' && modal.campusIds.length === 0)}>
                {save.isPending
                  ? 'Saving…'
                  : modal.mode === 'add' && modal.campusIds.length > 1
                  ? `Apply to ${modal.campusIds.length} stations`
                  : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
