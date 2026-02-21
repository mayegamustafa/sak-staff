import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, ArrowLeftRight, BarChart2, BookOpen, TrendingUp } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data: summary, isLoading } = useQuery({
    queryKey: ['reports', 'summary'],
    queryFn: () => window.sakAPI.reports.summary(),
    enabled: true,
  });

  const { data: campusData = [] } = useQuery({
    queryKey: ['reports', 'staff-per-campus'],
    queryFn: () => window.sakAPI.reports.staffPerCampus(),
  });

  const s = summary as {
    totalStaff?: number;
    activeStaff?: number;
    campusCounts?: { name: string; count: number }[];
    contractCounts?: { contract_type: string; count: number }[];
    recentTransfers?: { id: string; type: string; employee_name: string; from_campus: string; to_campus: string; effective_date: string }[];
  } | undefined;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Welcome back, <span className="text-brand-400">{user?.username}</span>
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Staff', value: s?.totalStaff ?? '–', icon: Users, color: 'bg-brand-600' },
          { label: 'Active Staff', value: s?.activeStaff ?? '–', icon: TrendingUp, color: 'bg-emerald-600' },
          { label: 'Stations', value: (campusData as unknown[]).length || '–', icon: BarChart2, color: 'bg-purple-600' },
          { label: 'Pending Transfers', value: (s?.recentTransfers ?? []).length, icon: ArrowLeftRight, color: 'bg-amber-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card flex items-center gap-4">
            <div className={`${color} p-3 rounded-xl`}>
              <Icon size={20} className="text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {isLoading ? <span className="animate-pulse bg-slate-200 dark:bg-slate-700 rounded w-12 h-6 block" /> : value}
              </p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Staff per Campus */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
            <Users size={14} /> Staff per Station
          </h2>
          <div className="space-y-3">
            {(campusData as { name: string; code: string; staff_count: number }[]).map((c) => (
              <div key={c.code} className="flex items-center justify-between">
                <span className="text-sm text-slate-700 dark:text-slate-300">{c.name}</span>
                <span className="text-sm font-semibold text-brand-400">{c.staff_count}</span>
              </div>
            ))}
            {!campusData.length && (
              <p className="text-slate-600 text-sm text-center py-4">No data yet</p>
            )}
          </div>
        </div>

        {/* Recent Transfers */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
            <ArrowLeftRight size={14} /> Recent Transfers
          </h2>
          <div className="space-y-3">
            {(s?.recentTransfers ?? []).map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{t.employee_name}</p>
                  <p className="text-xs text-slate-500">
                    {t.from_campus} → {t.to_campus}
                  </p>
                </div>
                <span className={`badge-${t.type === 'transfer' ? 'pending' : 'active'} shrink-0`}>
                  {t.type}
                </span>
              </div>
            ))}
            {!s?.recentTransfers?.length && (
              <p className="text-slate-600 text-sm text-center py-4">No recent transfers</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
