import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Plus, Pencil, ToggleLeft, ToggleRight,
  Users, FolderOpen, Briefcase, GraduationCap, Trash2, X, BookOpen
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Campus {
  id: string; name: string; code: string;
  address?: string; phone?: string; email?: string;
  is_active: boolean; staff_count: number;
}
interface Department {
  id: string; name: string; code: string; campus_id: string | null; is_active: boolean;
}
interface JobTitle {
  id: string; title: string; pay_grade: string | null;
  category: 'teaching_staff' | 'non_teaching_professional' | 'support_staff' | 'administrator' | 'manager';
  is_active: boolean;
}
interface Stream {
  id: string; name: string; display_order: number; is_active: boolean;
}
interface SchoolClass {
  id: string; campus_id: string | null; name: string;
  level: 'kindergarten' | 'primary';
  display_order: number; is_active: boolean;
  campus_name: string | null; campus_code: string | null;
  streams: Stream[];
}
type ActiveTab = 'campuses' | 'departments' | 'jobtitles' | 'classes';

const EMPTY_CAMPUS = { name: '', code: '', address: '', phone: '', email: '' };
const EMPTY_DEPT   = { name: '', code: '' };
const EMPTY_JT     = { title: '', payGrade: '', category: 'teaching_staff' as JobTitle['category'] };
const EMPTY_CLASS  = { campusId: '', name: '', level: 'primary' as SchoolClass['level'], displayOrder: 0 };

const CLASS_LEVELS: { value: SchoolClass['level']; label: string; prefix: string }[] = [
  { value: 'kindergarten', label: 'Kindergarten', prefix: 'KG ' },
  { value: 'primary',      label: 'Primary',      prefix: 'P.'  },
];

const DEFAULT_CLASSES: { name: string; level: SchoolClass['level']; order: number }[] = [
  { name: 'KG 1', level: 'kindergarten', order: 1 },
  { name: 'KG 2', level: 'kindergarten', order: 2 },
  { name: 'KG 3', level: 'kindergarten', order: 3 },
  { name: 'P.1',  level: 'primary',      order: 4 },
  { name: 'P.2',  level: 'primary',      order: 5 },
  { name: 'P.3',  level: 'primary',      order: 6 },
  { name: 'P.4',  level: 'primary',      order: 7 },
  { name: 'P.5',  level: 'primary',      order: 8 },
  { name: 'P.6',  level: 'primary',      order: 9 },
  { name: 'P.7',  level: 'primary',      order: 10 },
];

const JT_CATEGORIES: { value: JobTitle['category']; label: string }[] = [
  { value: 'teaching_staff',          label: 'Teaching Staff' },
  { value: 'non_teaching_professional', label: 'Professional Non-Teaching Staff' },
  { value: 'support_staff',           label: 'Support Staff' },
  { value: 'administrator',           label: 'Administrator' },
  { value: 'manager',                 label: 'Manager' },
];

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function CampusesPage() {
  const { hasPermission, user } = useAuthStore();
  const qc = useQueryClient();
  // Allow write if super_admin, or has explicit campus_management permissions
  const canWrite = user?.role?.slug === 'super_admin'
    || hasPermission('campus_management', 'create')
    || hasPermission('campus_management', 'update');
  const [tab, setTab] = useState<ActiveTab>('campuses');

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Settings & Configuration</h1>
        <p className="text-slate-400 text-sm mt-0.5">Manage stations, departments, job titles and school classes</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {([
          { key: 'campuses',    icon: Building2,      label: 'Stations' },
          { key: 'departments', icon: FolderOpen,     label: 'Departments' },
          { key: 'jobtitles',  icon: Briefcase,      label: 'Job Titles' },
          { key: 'classes',    icon: GraduationCap,  label: 'Classes' },
        ] as { key: ActiveTab; icon: React.ElementType; label: string }[]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {tab === 'campuses'    && <CampusesTab    canWrite={canWrite} qc={qc} />}
      {tab === 'departments' && <DepartmentsTab canWrite={canWrite} qc={qc} />}
      {tab === 'jobtitles'  && <JobTitlesTab  canWrite={canWrite} qc={qc} />}
      {tab === 'classes'    && <ClassesTab    canWrite={canWrite} qc={qc} />}
    </div>
  );
}

// ── Campuses Tab ───────────────────────────────────────────────────────────────
function CampusesTab({ canWrite, qc }: { canWrite: boolean; qc: ReturnType<typeof useQueryClient> }) {
  const [modal, setModal] = useState<null | { mode: 'add' | 'edit'; data: typeof EMPTY_CAMPUS & { id?: string } }>(null);
  const [err, setErr] = useState('');

  const { data: campuses = [], isLoading } = useQuery<Campus[]>({
    queryKey: ['campuses'],
    queryFn: () => window.sakAPI.campuses.list() as Promise<Campus[]>,
  });

  const save = useMutation({
    mutationFn: async (m: typeof modal) => {
      if (!m) return;
      return m.mode === 'edit' && m.data.id
        ? window.sakAPI.campuses.update(m.data.id, m.data)
        : window.sakAPI.campuses.create(m.data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campuses'] }); setModal(null); setErr(''); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Save failed'),
  });

  const toggle = useMutation({
    mutationFn: (id: string) => window.sakAPI.campuses.toggleActive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campuses'] }),
  });

  return (
    <>
      <div className="flex justify-end">
        {canWrite && (
          <button className="btn-primary" onClick={() => { setErr(''); setModal({ mode: 'add', data: { ...EMPTY_CAMPUS } }); }}>
            <Plus size={15} /> Add Station
          </button>
        )}
      </div>

      {isLoading && <p className="text-slate-500 text-sm">Loading…</p>}
      {!isLoading && !campuses.length && (
        <div className="card text-center py-12">
          <Building2 size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500">No stations yet — click "Add Station" above.</p>
        </div>
      )}

      <div className="space-y-2">
        {campuses.map((c) => (
          <div key={c.id} className="card flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-800 dark:text-slate-100">{c.name}</span>
                <span className="text-xs font-mono px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded">{c.code}</span>
                {c.is_active ? <span className="badge-active">Active</span> : <span className="badge-inactive">Inactive</span>}
              </div>
              <div className="flex flex-wrap gap-x-4 text-xs text-slate-400 mt-0.5">
                {c.address && <span>{c.address}</span>}
                {c.phone   && <span>{c.phone}</span>}
                {c.email   && <span>{c.email}</span>}
              </div>
            </div>
            <span className="flex items-center gap-1 text-xs text-slate-400 shrink-0"><Users size={12} />{c.staff_count}</span>
            {canWrite && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { setErr(''); setModal({ mode: 'edit', data: { id: c.id, name: c.name, code: c.code, address: c.address ?? '', phone: c.phone ?? '', email: c.email ?? '' } }); }}
                  className="p-1.5 text-slate-400 hover:text-brand-400 transition-colors" title="Edit"
                ><Pencil size={14} /></button>
                <button
                  onClick={() => toggle.mutate(c.id)}
                  className={"p-1.5 transition-colors " + (c.is_active ? 'text-emerald-500 hover:text-slate-400' : 'text-slate-400 hover:text-emerald-500')}
                  title={c.is_active ? 'Deactivate' : 'Activate'}
                >{c.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal.mode === 'add' ? 'Add Station' : 'Edit Station'} onClose={() => setModal(null)}>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(modal); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Name *</label>
                <input className="input" required value={modal.data.name}
                  onChange={(e) => setModal((m) => m && ({ ...m, data: { ...m.data, name: e.target.value } }))} />
              </div>
              <div>
                <label className="label">Code *</label>
                <input className="input" required placeholder="e.g. SAK-MAIN" value={modal.data.code}
                  onChange={(e) => setModal((m) => m && ({ ...m, data: { ...m.data, code: e.target.value.toUpperCase() } }))} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={modal.data.phone}
                  onChange={(e) => setModal((m) => m && ({ ...m, data: { ...m.data, phone: e.target.value } }))} />
              </div>
              <div className="col-span-2">
                <label className="label">Email</label>
                <input className="input" type="email" value={modal.data.email}
                  onChange={(e) => setModal((m) => m && ({ ...m, data: { ...m.data, email: e.target.value } }))} />
              </div>
              <div className="col-span-2">
                <label className="label">Address / Location</label>
                <textarea className="input resize-none" rows={2} value={modal.data.address}
                  onChange={(e) => setModal((m) => m && ({ ...m, data: { ...m.data, address: e.target.value } }))} />
              </div>
            </div>
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ── Departments Tab ────────────────────────────────────────────────────────────
function DepartmentsTab({ canWrite, qc }: { canWrite: boolean; qc: ReturnType<typeof useQueryClient> }) {
  const [modal, setModal] = useState<null | { mode: 'add' | 'edit'; data: typeof EMPTY_DEPT & { id?: string } }>(null);
  const [err, setErr] = useState('');

  const { data: depts = [], isLoading } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => window.sakAPI.campuses.listDepartments() as Promise<Department[]>,
  });

  const save = useMutation({
    mutationFn: async (m: typeof modal) => {
      if (!m) return;
      return m.mode === 'edit' && m.data.id
        ? window.sakAPI.campuses.updateDepartment(m.data.id, m.data)
        : window.sakAPI.campuses.createDepartment(m.data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); setModal(null); setErr(''); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Save failed'),
  });

  const toggle = useMutation({
    mutationFn: (id: string) => window.sakAPI.campuses.toggleDeptActive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  });

  return (
    <>
      <div className="flex justify-end">
        {canWrite && (
          <button className="btn-primary" onClick={() => { setErr(''); setModal({ mode: 'add', data: { ...EMPTY_DEPT } }); }}>
            <Plus size={15} /> Add Department
          </button>
        )}
      </div>

      {isLoading && <p className="text-slate-500 text-sm">Loading…</p>}
      {!isLoading && !depts.length && (
        <div className="card text-center py-12">
          <FolderOpen size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">No departments yet</p>
          <p className="text-slate-400 text-sm">Add organisation-wide departments like Finance, Academic, Quality, TDP…</p>
        </div>
      )}

      {depts.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {depts.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                <FolderOpen size={15} className="text-brand-400 shrink-0" />
                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{d.name}</span>
                  <span className="text-xs font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{d.code}</span>
                  {!d.is_active && <span className="badge-inactive">Inactive</span>}
                </div>
                {canWrite && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { setErr(''); setModal({ mode: 'edit', data: { id: d.id, name: d.name, code: d.code } }); }}
                      className="p-1.5 text-slate-400 hover:text-brand-400 transition-colors rounded" title="Edit"
                    ><Pencil size={13} /></button>
                    <button
                      onClick={() => toggle.mutate(d.id)}
                      className={"p-1.5 transition-colors rounded " + (d.is_active ? 'text-emerald-500 hover:text-slate-400' : 'text-slate-400 hover:text-emerald-500')}
                      title={d.is_active ? 'Deactivate' : 'Activate'}
                    >{d.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <Modal title={modal.mode === 'add' ? 'Add Department' : 'Edit Department'} onClose={() => setModal(null)}>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(modal); }} className="space-y-3">
            <div>
              <label className="label">Department Name *</label>
              <input className="input" required placeholder="e.g. Finance, Academic, Quality" value={modal.data.name}
                onChange={(e) => setModal((m) => m && ({ ...m, data: { ...m.data, name: e.target.value } }))} />
            </div>
            <div>
              <label className="label">Code *</label>
              <input className="input" required placeholder="e.g. FIN, ACAD, TDP" value={modal.data.code}
                onChange={(e) => setModal((m) => m && ({ ...m, data: { ...m.data, code: e.target.value.toUpperCase() } }))} />
            </div>
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ── Job Titles Tab ─────────────────────────────────────────────────────────────
function JobTitlesTab({ canWrite, qc }: { canWrite: boolean; qc: ReturnType<typeof useQueryClient> }) {
  const [modal, setModal] = useState<null | { mode: 'add' | 'edit'; data: typeof EMPTY_JT & { id?: string } }>(null);
  const [err, setErr] = useState('');
  const [filterCat, setFilterCat] = useState<string>('all');

  const { data: jobTitles = [], isLoading } = useQuery<JobTitle[]>({
    queryKey: ['job-titles'],
    queryFn: () => window.sakAPI.jobTitles.list() as Promise<JobTitle[]>,
  });

  const save = useMutation({
    mutationFn: async (m: typeof modal) => {
      if (!m) return;
      const payload = { title: m.data.title, payGrade: m.data.payGrade || undefined, category: m.data.category };
      return m.mode === 'edit' && m.data.id
        ? window.sakAPI.jobTitles.update(m.data.id, payload)
        : window.sakAPI.jobTitles.create(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['job-titles'] }); setModal(null); setErr(''); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Save failed'),
  });

  const toggle = useMutation({
    mutationFn: (id: string) => window.sakAPI.jobTitles.toggleActive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-titles'] }),
  });

  const catLabel = (v: string) => JT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
  const filtered = filterCat === 'all' ? jobTitles : jobTitles.filter((j) => j.category === filterCat);
  const usedCats = JT_CATEGORIES.filter((c) => jobTitles.some((j) => j.category === c.value));
  const displayCats = filterCat === 'all' ? usedCats : JT_CATEGORIES.filter((c) => c.value === filterCat);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {(['all', ...JT_CATEGORIES.map((c) => c.value)] as string[]).map((v) => (
            <button key={v} onClick={() => setFilterCat(v)}
              className={"px-3 py-1 rounded-full text-xs font-medium transition-colors " + (
                filterCat === v
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              )}>
              {v === 'all' ? 'All' : catLabel(v)}
            </button>
          ))}
        </div>
        {canWrite && (
          <button className="btn-primary shrink-0" onClick={() => { setErr(''); setModal({ mode: 'add', data: { ...EMPTY_JT } }); }}>
            <Plus size={15} /> Add Job Title
          </button>
        )}
      </div>

      {isLoading && <p className="text-slate-500 text-sm">Loading…</p>}
      {!isLoading && !jobTitles.length && (
        <div className="card text-center py-12">
          <Briefcase size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500">No job titles yet.</p>
        </div>
      )}

      <div className="space-y-4">
        {displayCats.map(({ value, label }) => {
          const rows = filtered.filter((j) => j.category === value);
          if (!rows.length) return null;
          return (
            <div key={value} className="card p-0 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <Briefcase size={13} className="text-brand-400 shrink-0" />
                <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">{label}</span>
                <span className="text-xs text-slate-400 ml-1">{rows.length}</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((j) => (
                  <div key={j.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
                      <span className="text-sm text-slate-800 dark:text-slate-100">{j.title}</span>
                      {j.pay_grade && (
                        <span className="text-xs font-mono px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded">{j.pay_grade}</span>
                      )}
                      {!j.is_active && <span className="badge-inactive text-xs">Inactive</span>}
                    </div>
                    {canWrite && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => { setErr(''); setModal({ mode: 'edit', data: { id: j.id, title: j.title, payGrade: j.pay_grade ?? '', category: j.category } }); }}
                          className="p-1 text-slate-400 hover:text-brand-400 transition-colors" title="Edit"
                        ><Pencil size={13} /></button>
                        <button
                          onClick={() => toggle.mutate(j.id)}
                          className={"p-1 transition-colors " + (j.is_active ? 'text-emerald-500 hover:text-slate-400' : 'text-slate-400 hover:text-emerald-500')}
                          title={j.is_active ? 'Deactivate' : 'Activate'}
                        >{j.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <Modal title={modal.mode === 'add' ? 'Add Job Title' : 'Edit Job Title'} onClose={() => setModal(null)}>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(modal); }} className="space-y-3">
            <div>
              <label className="label">Job Title *</label>
              <input className="input" required placeholder="e.g. Senior Teacher" value={modal.data.title}
                onChange={(e) => setModal((m) => m && ({ ...m, data: { ...m.data, title: e.target.value } }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Category *</label>
                <select className="input" value={modal.data.category}
                  onChange={(e) => setModal((m) => m && ({ ...m, data: { ...m.data, category: e.target.value as JobTitle['category'] } }))}>
                  {JT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Pay Grade</label>
                <input className="input" placeholder="e.g. U4, P2, T3" value={modal.data.payGrade}
                  onChange={(e) => setModal((m) => m && ({ ...m, data: { ...m.data, payGrade: e.target.value } }))} />
              </div>
            </div>
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ── Classes Tab ───────────────────────────────────────────────────────────────
function ClassesTab({ canWrite, qc }: { canWrite: boolean; qc: ReturnType<typeof useQueryClient> }) {
  const [modal, setModal] = useState<null | { mode: 'add' | 'edit'; data: typeof EMPTY_CLASS & { id?: string } }>(null);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [newStreamName, setNewStreamName] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');

  const { data: campuses = [] } = useQuery<Campus[]>({
    queryKey: ['campuses'],
    queryFn: () => window.sakAPI.campuses.list() as Promise<Campus[]>,
  });

  const { data: classes = [], isLoading } = useQuery<SchoolClass[]>({
    queryKey: ['school-classes'],
    queryFn: () => window.sakAPI.classes.list() as Promise<SchoolClass[]>,
  });

  const save = useMutation({
    mutationFn: async (m: typeof modal) => {
      if (!m) return;
      const payload = {
        campusId: m.data.campusId || null,
        name: m.data.name,
        level: m.data.level,
        displayOrder: m.data.displayOrder,
      };
      return m.mode === 'edit' && m.data.id
        ? window.sakAPI.classes.update(m.data.id, payload)
        : window.sakAPI.classes.create(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['school-classes'] }); setModal(null); setErr(''); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Save failed'),
  });

  const toggle = useMutation({
    mutationFn: (id: string) => window.sakAPI.classes.toggleActive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['school-classes'] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => window.sakAPI.classes.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['school-classes'] }),
  });

  const addStream = useMutation({
    mutationFn: ({ classId, name }: { classId: string; name: string }) =>
      window.sakAPI.classes.addStream(classId, { name, displayOrder: 0 }),
    onSuccess: (_data, { classId }) => {
      qc.invalidateQueries({ queryKey: ['school-classes'] });
      setNewStreamName((prev) => ({ ...prev, [classId]: '' }));
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Failed to add stream'),
  });

  const delStream = useMutation({
    mutationFn: (streamId: string) => window.sakAPI.classes.deleteStream(streamId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['school-classes'] }),
  });

  // Group classes by campus
  const byCampus = [
    { label: 'All Stations (shared)', code: null, id: null, classes: classes.filter((c) => c.campus_id === null) },
    ...campuses.map((campus) => ({
      label: campus.name,
      code: campus.code,
      id: campus.id,
      classes: classes.filter((c) => c.campus_id === campus.id),
    })),
  ].filter((g) => g.classes.length > 0 || (g.id !== null));

  const levelColor = (level: SchoolClass['level']) => {
    if (level === 'kindergarten') return 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300';
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
  };

  const bulkAdd = async (campusId: string) => {
    for (const cls of DEFAULT_CLASSES) {
      try {
        await window.sakAPI.classes.create({
          campusId: campusId || null,
          name: cls.name,
          level: cls.level,
          displayOrder: cls.order,
        });
      } catch { /* skip duplicates */ }
    }
    qc.invalidateQueries({ queryKey: ['school-classes'] });
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Assign classes (KG 1–3, P.1–P.7, etc.) to stations and manage streams per class.
        </p>
        {canWrite && (
          <button className="btn-primary" onClick={() => { setErr(''); setModal({ mode: 'add', data: { ...EMPTY_CLASS } }); }}>
            <Plus size={15} /> Add Class
          </button>
        )}
      </div>

      {isLoading && <p className="text-slate-500 text-sm">Loading…</p>}

      {!isLoading && classes.length === 0 && (
        <div className="card text-center py-12">
          <GraduationCap size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">No classes configured yet</p>
          <p className="text-slate-400 text-sm mb-4">Add classes to each station, or use the quick-add to load the default KG1–KG3 and P.1–P.7 set.</p>
          {canWrite && campuses.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {campuses.map((c) => (
                <button key={c.id} onClick={() => bulkAdd(c.id)} className="btn-secondary text-xs">
                  <BookOpen size={12} /> Add defaults to {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        {byCampus.map((group) => (
          <div key={group.id ?? '__global'} className="card p-0 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Building2 size={13} className="text-brand-400 shrink-0" />
                <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">{group.label}</span>
                {group.code && <span className="text-xs font-mono text-slate-400">{group.code}</span>}
                <span className="text-xs text-slate-400 ml-1">{group.classes.length} class(es)</span>
              </div>
              {canWrite && group.id && group.classes.length === 0 && (
                <button onClick={() => bulkAdd(group.id!)} className="text-xs text-brand-500 hover:underline flex items-center gap-1">
                  <BookOpen size={11} /> Add defaults (KG + P.1–P.7)
                </button>
              )}
            </div>

            {group.classes.length === 0 ? (
              <p className="text-slate-400 text-sm px-4 py-3 italic">No classes assigned yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {group.classes.map((cls) => (
                  <div key={cls.id}>
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <button
                        onClick={() => setExpandedClass(expandedClass === cls.id ? null : cls.id)}
                        className="flex-1 flex items-center gap-2 text-left min-w-0"
                      >
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${levelColor(cls.level)}`}>
                          {CLASS_LEVELS.find((l) => l.value === cls.level)?.label}
                        </span>
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{cls.name}</span>
                        {cls.streams.length > 0 && (
                          <span className="text-xs text-slate-400">
                            {cls.streams.map((s) => s.name).join(', ')}
                          </span>
                        )}
                        {!cls.is_active && <span className="badge-inactive">Inactive</span>}
                      </button>
                      {canWrite && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => { setErr(''); setModal({ mode: 'edit', data: { id: cls.id, campusId: cls.campus_id ?? '', name: cls.name, level: cls.level, displayOrder: cls.display_order } }); }}
                            className="p-1.5 text-slate-400 hover:text-brand-400 transition-colors rounded" title="Edit"
                          ><Pencil size={13} /></button>
                          <button
                            onClick={() => toggle.mutate(cls.id)}
                            className={'p-1.5 transition-colors rounded ' + (cls.is_active ? 'text-emerald-500 hover:text-slate-400' : 'text-slate-400 hover:text-emerald-500')}
                            title={cls.is_active ? 'Deactivate' : 'Activate'}
                          >{cls.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}</button>
                          <button
                            onClick={() => { if (confirm(`Delete class ${cls.name}?`)) del.mutate(cls.id); }}
                            className="p-1.5 text-slate-400 hover:text-red-400 transition-colors rounded" title="Delete"
                          ><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>

                    {/* Streams panel */}
                    {expandedClass === cls.id && (
                      <div className="px-4 pb-3 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide pt-2 mb-2">Streams</p>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {cls.streams.length === 0 && (
                            <span className="text-xs text-slate-400 italic">No streams — add below or leave blank for a single-stream class.</span>
                          )}
                          {cls.streams.map((s) => (
                            <span key={s.id} className="flex items-center gap-1 text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full">
                              {s.name}
                              {canWrite && (
                                <button onClick={() => delStream.mutate(s.id)} className="text-slate-400 hover:text-red-400 ml-0.5">
                                  <X size={10} />
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                        {canWrite && (
                          <div className="flex gap-2 items-center">
                            <input
                              className="input text-xs py-1 flex-1 max-w-40"
                              placeholder="Stream name (e.g. A, East)"
                              value={newStreamName[cls.id] ?? ''}
                              onChange={(e) => setNewStreamName((p) => ({ ...p, [cls.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const name = (newStreamName[cls.id] ?? '').trim();
                                  if (name) addStream.mutate({ classId: cls.id, name });
                                }
                              }}
                            />
                            <button
                              className="btn-secondary text-xs py-1"
                              onClick={() => {
                                const name = (newStreamName[cls.id] ?? '').trim();
                                if (name) addStream.mutate({ classId: cls.id, name });
                              }}
                            ><Plus size={12} /> Add</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal.mode === 'add' ? 'Add Class' : 'Edit Class'} onClose={() => setModal(null)}>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(modal); }} className="space-y-3">
            <div>
              <label className="label">Station (leave blank for all stations)</label>
              <select className="input" value={modal.data.campusId}
                onChange={(e) => setModal((m) => m && ({ ...m, data: { ...m.data, campusId: e.target.value } }))}>
                <option value="">— All Stations (shared) —</option>
                {campuses.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Level *</label>
                <select className="input" required value={modal.data.level}
                  onChange={(e) => setModal((m) => m && ({ ...m, data: { ...m.data, level: e.target.value as SchoolClass['level'] } }))}>
                  {CLASS_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Class Name *</label>
                <input className="input" required placeholder={`e.g. ${CLASS_LEVELS.find((l) => l.value === modal.data.level)?.prefix ?? ''}1`}
                  value={modal.data.name}
                  onChange={(e) => setModal((m) => m && ({ ...m, data: { ...m.data, name: e.target.value } }))} />
              </div>
            </div>
            <div>
              <label className="label">Display Order</label>
              <input className="input" type="number" min={0} placeholder="0 = first" value={modal.data.displayOrder}
                onChange={(e) => setModal((m) => m && ({ ...m, data: { ...m.data, displayOrder: Number(e.target.value) } }))} />
            </div>
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ── Shared modal shell ─────────────────────────────────────────────────────────
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
