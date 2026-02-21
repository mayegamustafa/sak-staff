import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, UserPlus, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { formatDate } from '@sak/shared';

interface Employee {
  id: string;
  staff_no: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  gender: string;
  phone: string;
  email?: string;
  is_active: number | boolean;
}

export default function EmployeesPage() {
  const [search, setSearch] = useState('');
  const { hasPermission } = useAuthStore();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['employees', search],
    queryFn: () => window.sakAPI.employees.list({ search }),
    staleTime: 10_000,
  });

  const employees = (Array.isArray(data) ? data : (data as { data?: Employee[] })?.data ?? []) as Employee[];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Staff Directory</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manage staff profiles and biodata</p>
        </div>
        {hasPermission('staff_profiles', 'create') && (
          <button
            className="btn-primary shrink-0"
            onClick={() => navigate('/employees/new')}
          >
            <UserPlus size={16} /> Add Staff
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative w-full md:max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          className="input pl-9"
          placeholder="Search by name, staff number, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
            <tr>
              {['Staff No', 'Full Name', 'Gender', 'Phone', 'Email', 'Status', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {isLoading && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-slate-500">Loading…</td>
              </tr>
            )}
            {!isLoading && !employees.length && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-slate-500">No staff records found</td>
              </tr>
            )}
            {employees.map((emp) => (
              <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <td className="px-4 py-3 text-brand-400 font-mono text-xs">{emp.staff_no}</td>
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                  {emp.first_name} {emp.middle_name ? `${emp.middle_name} ` : ''}{emp.last_name}
                </td>
                <td className="px-4 py-3 text-slate-400 capitalize">{emp.gender}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{emp.phone}</td>
                <td className="px-4 py-3 text-slate-400">{emp.email ?? '–'}</td>
                <td className="px-4 py-3">
                  {emp.is_active
                    ? <span className="badge-active">Active</span>
                    : <span className="badge-inactive">Inactive</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => navigate(`/employees/${emp.id}`)}
                    className="p-1.5 text-slate-500 hover:text-brand-400 transition-colors"
                    title="View profile"
                  >
                    <Eye size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
