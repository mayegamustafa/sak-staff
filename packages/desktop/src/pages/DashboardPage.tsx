import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users, BarChart2, TrendingUp, BookOpen,
  AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AbsentStation {
  campus_id: string;
  campus_name: string;
  total_absent_staff: number;
  total_absent_days: number;
  staff: {
    employee_id: string;
    employee_name: string;
    staff_no: string;
    total_absent_days: number;
    reasons: string[];
  }[];
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuthStore();
  const currentYear = new Date().getFullYear();

  // ── Dashboard-level filters ─────────────────────────────────────────────────
  const [dashYear, setDashYear] = useState(String(currentYear));
  const [dashTerm, setDashTerm] = useState('');

  // ── Absent-by-station accordion state ───────────────────────────────────────
  const [expandedStation, setExpandedStation] = useState<string | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: summary, isLoading } = useQuery({
    queryKey: ['reports', 'summary'],
    queryFn: () => window.sakAPI.reports.summary(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: campusData = [] } = useQuery({
    queryKey: ['reports', 'staff-per-campus'],
    queryFn: () => window.sakAPI.reports.staffPerCampus(),
    staleTime: 5 * 60 * 1000,
  });

  const alertParams: Record<string, unknown> = {};
  if (dashYear) alertParams.year = dashYear;
  if (dashTerm) alertParams.term = dashTerm;

  const { data: alertsData } = useQuery({
    queryKey: ['analytics', 'attendance-alerts', dashYear, dashTerm],
    queryFn: () => (window.sakAPI as any).analytics.attendanceAlerts(alertParams),
    staleTime: 2 * 60 * 1000,
  });

  const { data: absentStations = [], isLoading: loadingAbsent } = useQuery<AbsentStation[]>({
    queryKey: ['analytics', 'absent-by-station', dashYear, dashTerm],
    queryFn: async () => (await (window.sakAPI as any).analytics.absentByStation(alertParams)) as AbsentStation[],
    staleTime: 2 * 60 * 1000,
  });

  // ── Derived values ──────────────────────────────────────────────────────────
  const s = summary as {
    totalStaff?: number;
    activeStaff?: number;
    activeStationsCount?: number;
    monthlyJoined?: { month: string; count: number }[];
    monthlyLeft?:   { month: string; count: number }[];
  } | undefined;

  const alertCount = (alertsData as any)?.count ?? 0;

  // ── Build last-12-months chart scaffold ─────────────────────────────────────
  const monthLabels: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    monthLabels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const joinedMap = Object.fromEntries((s?.monthlyJoined ?? []).map((r) => [r.month, Number(r.count)]));
  const leftMap   = Object.fromEntries((s?.monthlyLeft   ?? []).map((r) => [r.month, Number(r.count)]));
  const chartData = monthLabels.map((m) => ({
    label:  m.slice(5),
    joined: joinedMap[m] ?? 0,
    left:   leftMap[m]   ?? 0,
  }));
  const chartMax = Math.max(1, ...chartData.map((d) => Math.max(d.joined, d.left)));

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">

      {/* Header + compact year/term filter */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Welcome back, <span className="text-brand-400">{user?.username}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input text-sm py-1.5 w-28"
            value={dashYear}
            onChange={(e) => setDashYear(e.target.value)}
          >
            {Array.from({ length: 6 }, (_, i) => currentYear - i).map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
          <select
            className="input text-sm py-1.5 w-32"
            value={dashTerm}
            onChange={(e) => setDashTerm(e.target.value)}
          >
            <option value="">All Terms</option>
            <option value="I">Term I</option>
            <option value="II">Term II</option>
            <option value="III">Term III</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Staff',
            value: s?.totalStaff ?? '–',
            icon: Users,
            color: 'bg-brand-600',
          },
          {
            label: 'Active Staff',
            value: s?.activeStaff ?? '–',
            icon: TrendingUp,
            color: 'bg-emerald-600',
          },
          {
            label: 'Stations',
            value: (s?.activeStationsCount ?? (campusData as unknown[]).length) || '–',
            icon: BarChart2,
            color: 'bg-purple-600',
          },
          {
            label: 'Attendance Alerts',
            value: isLoading ? '–' : alertCount,
            icon: AlertTriangle,
            color: 'bg-rose-600',
            sub: '< 75% attendance',
          },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="card flex items-center gap-4">
            <div className={`${color} p-3 rounded-xl shrink-0`}>
              <Icon size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {isLoading
                  ? <span className="animate-pulse bg-slate-200 dark:bg-slate-700 rounded w-12 h-6 block" />
                  : value}
              </p>
              <p className="text-xs text-slate-400">{label}</p>
              {sub && <p className="text-xs text-slate-400 italic">{sub}</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Staff per Station */}
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
            {!(campusData as unknown[]).length && (
              <p className="text-slate-500 text-sm text-center py-4">No data yet</p>
            )}
          </div>
        </div>

        {/* Absent Staff Per Station */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
            <AlertTriangle size={14} className="text-rose-500" /> Absent Staff per Station
          </h2>
          {loadingAbsent ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
              ))}
            </div>
          ) : absentStations.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-6">
              No absences recorded
              {(dashTerm || dashYear) && (
                <span className="block text-xs mt-1 text-slate-400">
                  for {dashTerm ? `Term ${dashTerm} ` : ''}{dashYear}
                </span>
              )}
            </p>
          ) : (
            <div className="space-y-1">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 pb-1 border-b border-slate-100 dark:border-slate-700 text-xs font-medium text-slate-400 px-1">
                <span>Station</span>
                <span className="text-right">Absent</span>
                <span className="text-right">Days</span>
              </div>
              {absentStations.map((station) => (
                <div key={station.campus_id}>
                  {/* Station row */}
                  <button
                    className="w-full grid grid-cols-[1fr_auto_auto] gap-2 items-center px-1 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                    onClick={() =>
                      setExpandedStation(
                        expandedStation === station.campus_id ? null : station.campus_id,
                      )
                    }
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 min-w-0">
                      {expandedStation === station.campus_id
                        ? <ChevronDown size={13} className="text-slate-400 shrink-0" />
                        : <ChevronRight size={13} className="text-slate-400 shrink-0" />}
                      <span className="truncate">{station.campus_name}</span>
                    </span>
                    <span className="text-right font-semibold text-rose-600 text-sm">
                      {station.total_absent_staff}
                    </span>
                    <span className="text-right text-slate-500 text-xs">
                      {station.total_absent_days}d
                    </span>
                  </button>

                  {/* Expanded staff list */}
                  {expandedStation === station.campus_id && (
                    <div className="ml-5 mb-2 rounded-md bg-slate-50 dark:bg-slate-700/40 divide-y divide-slate-100 dark:divide-slate-700">
                      {station.staff.map((st) => (
                        <div
                          key={st.employee_id}
                          className="flex items-start justify-between gap-2 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                              {st.employee_name}
                            </p>
                            <p className="text-xs text-slate-400">{st.staff_no}</p>
                            {st.reasons.length > 0 && (
                              <p className="text-xs text-slate-500 mt-0.5 truncate">
                                {st.reasons.join(' · ')}
                              </p>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-rose-600 shrink-0 mt-0.5">
                            {st.total_absent_days}d
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Staff Movement – Last 12 Months */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
          <BookOpen size={14} /> Staff Movement – Last 12 Months
        </h2>
        <div className="flex items-end gap-1.5 h-32 overflow-x-auto pb-1">
          {chartData.map((d) => (
            <div key={d.label} className="flex flex-col items-center gap-0.5 flex-1 min-w-[28px]">
              <div className="w-full flex gap-0.5 items-end" style={{ height: '96px' }}>
                <div
                  title={`Joined: ${d.joined}`}
                  className="flex-1 bg-emerald-500 rounded-t-sm transition-all"
                  style={{
                    height: `${Math.round((d.joined / chartMax) * 96)}px`,
                    minHeight: d.joined > 0 ? '3px' : '0',
                  }}
                />
                <div
                  title={`Left: ${d.left}`}
                  className="flex-1 bg-rose-400 rounded-t-sm transition-all"
                  style={{
                    height: `${Math.round((d.left / chartMax) * 96)}px`,
                    minHeight: d.left > 0 ? '3px' : '0',
                  }}
                />
              </div>
              <span className="text-xs text-slate-400 leading-none">{d.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> Joined
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-rose-400 inline-block" /> Left
          </span>
        </div>
      </div>

    </div>
  );
}
