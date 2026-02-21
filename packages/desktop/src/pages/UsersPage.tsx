import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, ToggleLeft, ToggleRight, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { formatDate } from '@sak/shared';

interface User {
  id: string;
  username: string;
  email: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  role_name: string;
  role_slug: string;
}

interface Role { id: string; name: string; slug: string }
interface Campus { id: string; name: string; code: string }

const EMPTY_FORM = {
  username: '', email: '', password: '', roleId: '', campusId: '',
};

export default function UsersPage() {
  const { hasPermission } = useAuthStore();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErr, setFormErr] = useState('');

  const canCreate = hasPermission('user_management', 'create');
  const canUpdate = hasPermission('user_management', 'update');

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => window.sakAPI.users.list() as Promise<User[]>,
    enabled: hasPermission('user_management', 'read'),
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: () => window.sakAPI.users.roles() as Promise<Role[]>,
    enabled: showModal,
  });

  const { data: campuses = [] } = useQuery<Campus[]>({
    queryKey: ['campuses'],
    queryFn: () => window.sakAPI.campuses.list() as Promise<Campus[]>,
    enabled: showModal,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createUser = useMutation({
    mutationFn: () => window.sakAPI.users.create({
      username: form.username,
      email:    form.email,
      password: form.password,
      roleId:   form.roleId,
      campusId: form.campusId || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowModal(false);
      setForm(EMPTY_FORM);
      setFormErr('');
    },
    onError: (e: any) => setFormErr(e?.response?.data?.message ?? 'Create failed'),
  });

  const toggleUser = useMutation({
    mutationFn: (id: string) => window.sakAPI.users.toggleActive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  if (!hasPermission('user_management', 'read')) {
    return (
      <div className="p-6">
        <div className="card text-center py-10">
          <p className="text-slate-400">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">User Management</h1>
          <p className="text-slate-400 text-sm mt-0.5">System access accounts and roles</p>
        </div>
        {canCreate && (
          <button
            className="btn-primary shrink-0"
            onClick={() => { setFormErr(''); setShowModal(true); }}
          >
            <UserPlus size={16} /> Add User
          </button>
        )}
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Users', value: users.length },
          { label: 'Active',      value: users.filter((u) => u.is_active).length },
          { label: 'Inactive',    value: users.filter((u) => !u.is_active).length },
        ].map((s) => (
          <div key={s.label} className="card text-center py-3">
            <p className="text-2xl font-bold text-brand-400">{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
              <tr>
                {['User', 'Role', 'Last Login', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {isLoading && (
                <tr><td colSpan={5} className="text-center py-10 text-slate-500">Loading…</td></tr>
              )}
              {!isLoading && !users.length && (
                <tr><td colSpan={5} className="text-center py-10 text-slate-400">No users found</td></tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{u.username}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <ShieldCheck size={13} className="text-brand-400 shrink-0" />
                      {u.role_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {u.last_login_at ? formatDate(u.last_login_at) : <span className="text-slate-500">Never</span>}
                  </td>
                  <td className="px-4 py-3">
                    {u.is_active
                      ? <span className="badge-active">Active</span>
                      : <span className="badge-inactive">Inactive</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {canUpdate && (
                      <button
                        onClick={() => toggleUser.mutate(u.id)}
                        className={`p-1.5 transition-colors ${u.is_active ? 'text-emerald-500 hover:text-slate-400' : 'text-slate-400 hover:text-emerald-500'}`}
                        title={u.is_active ? 'Deactivate user' : 'Activate user'}
                      >
                        {u.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add User Modal ─────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">Add System User</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none">&times;</button>
            </div>
            <form
              className="p-5 space-y-4"
              onSubmit={(e) => { e.preventDefault(); createUser.mutate(); }}
            >
              <div>
                <label className="label">Username *</label>
                <input className="input" required minLength={3} value={form.username} onChange={set('username')} />
              </div>
              <div>
                <label className="label">Email *</label>
                <input className="input" type="email" required value={form.email} onChange={set('email')} />
              </div>
              <div>
                <label className="label">Password *</label>
                <input className="input" type="password" required minLength={8} value={form.password} onChange={set('password')}
                  placeholder="Min. 8 characters" />
              </div>
              <div>
                <label className="label">Role *</label>
                <select className="input" required value={form.roleId} onChange={set('roleId')}>
                  <option value="">— Select Role —</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Assign Station (optional)</label>
                <select className="input" value={form.campusId} onChange={set('campusId')}>
                  <option value="">— All Stations —</option>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {formErr && <p className="text-red-400 text-sm">{formErr}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={createUser.isPending}>
                  {createUser.isPending ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
