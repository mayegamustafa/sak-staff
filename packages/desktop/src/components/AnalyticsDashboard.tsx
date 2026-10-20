import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
  ScatterChart, Scatter, ZAxis,
  PieChart, Pie, Cell,
} from 'recharts';
import { AlertTriangle, Award, TrendingUp, Users, CheckCircle, Printer, ChevronDown, ChevronRight } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface OverviewData {
  avgPerformance:      number | null;
  avgAttendance:       number | null;
  totalStaffEvaluated: number;
  bestCampusPerf:  { campus_name: string; avg_perf: number } | null;
  worstCampusAtt:  { campus_name: string; avg_att: number } | null;
}
interface StationRow {
  campus_id: string; campus_name: string; campus_code: string;
  avg_perf: number | null; avg_att: number | null;
  staff_evaluated: number; total_absent_days: number;
}
interface StaffRow {
  staff_id: string; employee_name: string; staff_no: string; campus_name: string;
  year: number; performance_pct: number; performance_cat: string;
  attendance_pct: number | null; alert_low_perf: boolean; alert_low_att: boolean;
}
interface TrendPoint { year: number; term: string; avg_score?: number; avg_attendance_pct?: number; label: string; }
interface TrendsData  { performance: TrendPoint[]; attendance: TrendPoint[]; }
interface AttendanceData {
  reasons: { reason: string; total_days: number; occurrences: number }[];
  campusStats: { campus_id: string; campus_name: string; avg_attendance_pct: number | null; total_absent_days: number }[];
}
interface AbsentStationRow {
  campus_id: string; campus_name: string;
  total_absent_staff: number; total_absent_days: number;
  staff: { employee_id: string; employee_name: string; staff_no: string; total_absent_days: number; reasons: string[] }[];
}
interface AlertsData { count: number; threshold: number; staff: { employee_name: string; staff_no: string; campus_name: string; attendance_pct: number }[]; }

// ─── Colours ──────────────────────────────────────────────────────────────────
const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#0ea5e9'];
const PIE_COLORS   = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pct(n: number | null | undefined, decimals = 1) {
  if (n == null) return '—';
  return `${Number(n).toFixed(decimals)}%`;
}

function SummaryCard({ label, value, sub, icon, color }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; color: string;
}) {
  return (
    <div className="card flex items-start gap-4 p-4">
      <div className={`rounded-lg p-2.5 ${color}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-800 truncate">{value}</p>
        {sub && <p className="text-xs text-slate-400 truncate">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  /** When true: hide page title/description (used when embedded in another page) */
  embedded?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ANALYTICS DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
export default function AnalyticsDashboard({ embedded = false }: Props) {
  const currentYear = new Date().getFullYear();
  const [filters, setFilters] = useState<{ year: string; term: string; campusId: string; weekNumber: string }>(
    { year: String(currentYear), term: '', campusId: '', weekNumber: '' },
  );
  const [applied, setApplied] = useState(filters);
  const [activeStaffFilter, setActiveStaffFilter] = useState<'all' | 'low_perf' | 'low_att'>('all');
  const [expandedAbsentStation, setExpandedAbsentStation] = useState<string | null>(null);

  const { data: campuses = [] } = useQuery<{ id: string; name: string; code: string }[]>({
    queryKey: ['campuses-list'],
    queryFn: async () => {
      const res = await (window.sakAPI as any).campuses?.list({ limit: 200 });
      return (res?.data ?? res ?? []) as { id: string; name: string; code: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const apiParams = {
    year:       applied.year       || undefined,
    term:       applied.term       || undefined,
    campusId:   applied.campusId   || undefined,
    weekNumber: applied.weekNumber || undefined,
  };

  const { data: overview, isLoading: loadingOverview } = useQuery<OverviewData>({
    queryKey: ['analytics-overview', applied],
    queryFn: async () => (await (window.sakAPI as any).analytics.overview(apiParams)) as OverviewData,
    staleTime: 2 * 60 * 1000,
  });
  const { data: stations = [], isLoading: loadingStations } = useQuery<StationRow[]>({
    queryKey: ['analytics-stations', applied],
    queryFn: async () => (await (window.sakAPI as any).analytics.stations(apiParams)) as StationRow[],
    staleTime: 2 * 60 * 1000,
  });
  const { data: staffData = [], isLoading: loadingStaff } = useQuery<StaffRow[]>({
    queryKey: ['analytics-staff', applied],
    queryFn: async () => (await (window.sakAPI as any).analytics.staff(apiParams)) as StaffRow[],
    staleTime: 2 * 60 * 1000,
  });
  const { data: trends, isLoading: loadingTrends } = useQuery<TrendsData>({
    queryKey: ['analytics-trends', applied],
    queryFn: async () => (await (window.sakAPI as any).analytics.trends(apiParams)) as TrendsData,
    staleTime: 2 * 60 * 1000,
  });
  const { data: attData, isLoading: loadingAtt } = useQuery<AttendanceData>({
    queryKey: ['analytics-attendance', applied],
    queryFn: async () => (await (window.sakAPI as any).analytics.attendance(apiParams)) as AttendanceData,
    staleTime: 2 * 60 * 1000,
  });
  const { data: absentStations = [], isLoading: loadingAbsent } = useQuery<AbsentStationRow[]>({
    queryKey: ['analytics-absent-by-station', applied],
    queryFn: async () => (await (window.sakAPI as any).analytics.absentByStation(apiParams)) as AbsentStationRow[],
    staleTime: 2 * 60 * 1000,
  });
  const { data: alertsData } = useQuery<AlertsData>({
    queryKey: ['analytics-attendance-alerts', applied],
    queryFn: async () => (await (window.sakAPI as any).analytics.attendanceAlerts(apiParams)) as AlertsData,
    staleTime: 2 * 60 * 1000,
  });

  function applyFilters() { setApplied({ ...filters }); }

  const rankedStations = [...stations]
    .filter((s) => s.avg_perf != null)
    .sort((a, b) => (b.avg_perf ?? 0) - (a.avg_perf ?? 0));

  const filteredStaff = staffData.filter((s) => {
    if (activeStaffFilter === 'low_perf') return s.alert_low_perf;
    if (activeStaffFilter === 'low_att')  return s.alert_low_att;
    return true;
  });

  const perfBarData = rankedStations.map((s) => ({ name: s.campus_code || s.campus_name, perf: s.avg_perf }));
  const attBarData  = [...stations]
    .filter((s) => s.avg_att != null)
    .sort((a, b) => (b.avg_att ?? 0) - (a.avg_att ?? 0))
    .map((s) => ({ name: s.campus_code || s.campus_name, att: s.avg_att }));
  const scatterData = staffData
    .filter((s) => s.attendance_pct != null)
    .map((s) => ({ x: s.attendance_pct!, y: s.performance_pct, z: 1, name: s.employee_name, campus: s.campus_name }));
  const pieData = (attData?.reasons ?? []).map((r) => ({ name: r.reason, value: Number(r.total_days) }));

  const isLoading = loadingOverview || loadingStations;

  const appliedCampusName = applied.campusId
    ? campuses.find((c) => c.id === applied.campusId)?.name ?? 'Unknown'
    : 'All Stations';
  const printSubtitle = [
    applied.year ? `Year ${applied.year}` : 'All Years',
    applied.term ? `Term ${applied.term}` : 'All Terms',
    applied.weekNumber ? `WK${applied.weekNumber}` : '',
    appliedCampusName,
  ].filter(Boolean).join(' · ');

  return (
    <>
      {/* ─── Print-only styles ───────────────────────────────────────────── */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #analytics-printable, #analytics-printable * { visibility: visible; }
          #analytics-printable {
            position: absolute !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important; max-width: 100% !important;
            padding: 10mm 12mm !important;
          }
          .analytics-no-print { display: none !important; }
          .analytics-print-only { display: block !important; }
          .analytics-print-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 10px !important;
          }
          .card { box-shadow: none !important; border: 1px solid #e2e8f0 !important; break-inside: avoid; }
          h2 { break-after: avoid; }
          tr { break-inside: avoid; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { margin: 8mm; }
        }
      `}</style>

      <div id="analytics-printable" className="space-y-6">

        {/* Print-only header */}
        <div className="analytics-print-only hidden border-b border-slate-200 pb-4 mb-2">
          <div className="flex items-center gap-3">
            <img src="/sak.jpg" alt="SAK" className="w-8 h-8 rounded object-cover" />
            <div>
              <h1 className="text-lg font-bold text-slate-900">Performance &amp; Attendance Analytics Report</h1>
              <p className="text-xs text-slate-500">
                {printSubtitle} &nbsp;·&nbsp; Printed {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        {/* Section header (hidden when embedded — parent page already provides context) */}
        {!embedded && (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Performance &amp; Attendance Analytics</h1>
              <p className="text-slate-500 text-sm mt-0.5">Overview of staff appraisals and attendance across all stations</p>
            </div>
            <button
              className="analytics-no-print btn-secondary flex items-center gap-2 shrink-0"
              onClick={() => window.print()}
            >
              <Printer size={15} />
              Print Report
            </button>
          </div>
        )}

        {/* Filter bar */}
        <div className="analytics-no-print card p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="label">Year</label>
              <select className="input w-28" value={filters.year} onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))}>
                <option value="">All years</option>
                {Array.from({ length: 6 }, (_, i) => currentYear - i).map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Term</label>
              <select className="input w-32" value={filters.term} onChange={(e) => setFilters((f) => ({ ...f, term: e.target.value }))}>
                <option value="">All terms</option>
                <option value="I">Term I</option>
                <option value="II">Term II</option>
                <option value="III">Term III</option>
              </select>
            </div>
            <div>
              <label className="label">Station / Campus</label>
              <select className="input w-44" value={filters.campusId} onChange={(e) => setFilters((f) => ({ ...f, campusId: e.target.value }))}>
                <option value="">All stations</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Week</label>
              <select className="input w-28" value={filters.weekNumber} onChange={(e) => setFilters((f) => ({ ...f, weekNumber: e.target.value }))}>
                <option value="">All weeks</option>
                {Array.from({ length: 13 }, (_, i) => i + 1).map((w) => (
                  <option key={w} value={String(w)}>WK{w}</option>
                ))}
              </select>
            </div>
            <button className="analytics-no-print btn-primary" onClick={applyFilters}>Apply Filters</button>
            {embedded && (
              <button
                className="analytics-no-print btn-secondary flex items-center gap-2 ml-auto"
                onClick={() => window.print()}
              >
                <Printer size={15} />
                Print Report
              </button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="card p-4 animate-pulse h-20 bg-slate-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            <SummaryCard label="Avg Performance" value={pct(overview?.avgPerformance)} sub="Across all evaluated staff" icon={<Award size={20} className="text-indigo-600" />} color="bg-indigo-50" />
            <SummaryCard label="Avg Attendance" value={pct(overview?.avgAttendance)} sub="Days present vs expected" icon={<CheckCircle size={20} className="text-emerald-600" />} color="bg-emerald-50" />
            <SummaryCard label="Staff Evaluated" value={String(overview?.totalStaffEvaluated ?? 0)} sub="With appraisal records" icon={<Users size={20} className="text-blue-600" />} color="bg-blue-50" />
            <SummaryCard label="Best Station (Perf)" value={overview?.bestCampusPerf?.campus_name ?? '—'} sub={overview?.bestCampusPerf ? pct(overview.bestCampusPerf.avg_perf) : undefined} icon={<TrendingUp size={20} className="text-amber-600" />} color="bg-amber-50" />
            <SummaryCard label="Lowest Attendance" value={overview?.worstCampusAtt?.campus_name ?? '—'} sub={overview?.worstCampusAtt ? pct(overview.worstCampusAtt.avg_att) : undefined} icon={<AlertTriangle size={20} className="text-rose-600" />} color="bg-rose-50" />
          </div>
        )}

        {/* Attendance Intelligence Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Most Affected Station */}
          <div className="card p-4 border-l-4 border-rose-400 flex items-center gap-3">
            <AlertTriangle size={18} className="text-rose-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-slate-500 font-medium">Most Affected Station</p>
              <p className="text-sm font-bold text-slate-800 truncate">
                {loadingStations
                  ? '…'
                  : ([...stations].sort((a, b) => (a.avg_att ?? 100) - (b.avg_att ?? 100))[0]?.campus_name ?? '—')}
              </p>
              <p className="text-xs text-slate-400">
                {loadingStations
                  ? ''
                  : (() => {
                      const worst = [...stations].sort((a, b) => (a.avg_att ?? 100) - (b.avg_att ?? 100))[0];
                      return worst?.avg_att != null ? `${pct(worst.avg_att)} attendance` : 'No attendance data';
                    })()}
              </p>
            </div>
          </div>
          {/* Most Common Absence Reason */}
          <div className="card p-4 border-l-4 border-amber-400 flex items-center gap-3">
            <CheckCircle size={18} className="text-amber-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-slate-500 font-medium">Most Common Absence Reason</p>
              <p className="text-sm font-bold text-slate-800 truncate">
                {loadingAtt ? '…' : (attData?.reasons[0]?.reason ?? '—')}
              </p>
              <p className="text-xs text-slate-400">
                {loadingAtt ? '' : (attData?.reasons[0] ? `${attData.reasons[0].total_days} days across ${attData.reasons[0].occurrences} records` : 'No absence data')}
              </p>
            </div>
          </div>
          {/* Low Attendance Alerts */}
          <div className="card p-4 border-l-4 border-indigo-400 flex items-center gap-3">
            <TrendingUp size={18} className="text-indigo-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-slate-500 font-medium">Low Attendance Alerts</p>
              <p className="text-sm font-bold text-slate-800">
                {alertsData == null ? '…' : alertsData.count}
              </p>
              <p className="text-xs text-slate-400">Staff below 75% attendance</p>
            </div>
          </div>
        </div>

        {/* Charts Row 1: Station Bars */}
        <div className="analytics-print-grid grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="card p-4">
            <h2 className="font-semibold text-slate-700 mb-3">Station Performance Comparison</h2>
            {loadingStations ? <div className="h-56 animate-pulse bg-slate-100 rounded" /> : perfBarData.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-14">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={perfBarData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                  <Bar dataKey="perf" name="Avg Performance %" fill="#6366f1" radius={[4, 4, 0, 0]}>
                    {perfBarData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="card p-4">
            <h2 className="font-semibold text-slate-700 mb-3">Station Attendance Comparison</h2>
            {loadingStations ? <div className="h-56 animate-pulse bg-slate-100 rounded" /> : attBarData.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-14">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={attBarData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                  <Bar dataKey="att" name="Avg Attendance %" fill="#22c55e" radius={[4, 4, 0, 0]}>
                    {attBarData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Charts Row 2: Trend Lines */}
        <div className="analytics-print-grid grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="card p-4">
            <h2 className="font-semibold text-slate-700 mb-3">Performance Trend (by Term)</h2>
            {loadingTrends ? <div className="h-56 animate-pulse bg-slate-100 rounded" /> : !trends?.performance?.length ? (
              <p className="text-slate-400 text-sm text-center py-14">No trend data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trends.performance} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                  <Line type="monotone" dataKey="avg_score" name="Avg Score" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="card p-4">
            <h2 className="font-semibold text-slate-700 mb-3">Attendance Trend (by Term)</h2>
            {loadingTrends ? <div className="h-56 animate-pulse bg-slate-100 rounded" /> : !trends?.attendance?.length ? (
              <p className="text-slate-400 text-sm text-center py-14">No trend data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trends.attendance} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                  <Line type="monotone" dataKey="avg_attendance_pct" name="Avg Attendance" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Charts Row 3: Scatter + Pie */}
        <div className="analytics-print-grid grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="card p-4">
            <h2 className="font-semibold text-slate-700 mb-1">Performance vs Attendance</h2>
            <p className="text-xs text-slate-400 mb-3">Each dot = one staff member</p>
            {loadingStaff ? <div className="h-56 animate-pulse bg-slate-100 rounded" /> : scatterData.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-14">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <ScatterChart margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="x" name="Attendance %" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} label={{ value: 'Attendance %', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                  <YAxis type="number" dataKey="y" name="Performance %" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                  <ZAxis range={[40, 40]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-white border border-slate-200 rounded shadow-lg px-3 py-2 text-xs">
                          <p className="font-semibold text-slate-800">{d.name}</p>
                          <p className="text-slate-500">{d.campus}</p>
                          <p>Performance: <strong>{d.y.toFixed(1)}%</strong></p>
                          <p>Attendance: <strong>{d.x.toFixed(1)}%</strong></p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatterData} fill="#6366f1" fillOpacity={0.7} />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="card p-4">
            <h2 className="font-semibold text-slate-700 mb-3">Absence Reasons Breakdown</h2>
            {loadingAtt ? <div className="h-56 animate-pulse bg-slate-100 rounded" /> : pieData.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-14">No absence data available</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="60%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any, name: any) => [`${v} days`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 min-w-0 space-y-1.5">
                  {pieData.slice(0, 7).map((d, i) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="truncate text-slate-600">{d.name}</span>
                      <span className="ml-auto font-semibold text-slate-700 flex-shrink-0">{d.value}d</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Station Ranking Table */}
        <div className="card p-4">
          <h2 className="font-semibold text-slate-700 mb-3">Station Rankings</h2>
          {loadingStations ? <div className="h-32 animate-pulse bg-slate-100 rounded" /> : rankedStations.length === 0 ? (
            <p className="text-slate-400 text-sm">No station data available for selected filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 pr-4 font-medium text-slate-500 w-10">#</th>
                    <th className="text-left py-2 pr-4 font-medium text-slate-500">Station</th>
                    <th className="text-right py-2 pr-4 font-medium text-slate-500">Avg Performance</th>
                    <th className="text-right py-2 pr-4 font-medium text-slate-500">Avg Attendance</th>
                    <th className="text-right py-2 pr-4 font-medium text-slate-500">Total Absent Days</th>
                    <th className="text-right py-2 font-medium text-slate-500">Staff Evaluated</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedStations.map((s, i) => (
                    <tr key={s.campus_id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 pr-4 text-slate-400 font-medium">{i + 1}</td>
                      <td className="py-2 pr-4 font-medium text-slate-800">{s.campus_name}</td>
                      <td className="py-2 pr-4 text-right">
                        <span className={`font-semibold ${s.avg_perf != null && s.avg_perf >= 80 ? 'text-emerald-600' : s.avg_perf != null && s.avg_perf < 60 ? 'text-rose-600' : 'text-slate-700'}`}>
                          {pct(s.avg_perf)}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <span className={`font-semibold ${s.avg_att != null && s.avg_att >= 85 ? 'text-emerald-600' : s.avg_att != null && s.avg_att < 75 ? 'text-rose-600' : 'text-slate-700'}`}>
                          {pct(s.avg_att)}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right text-slate-600">{s.total_absent_days}</td>
                      <td className="py-2 text-right text-slate-600">{s.staff_evaluated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Absent Staff Per Station */}
        <div className="card p-4">
          <h2 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={15} className="text-rose-500" /> Absent Staff per Station
          </h2>
          {loadingAbsent ? (
            <div className="h-24 animate-pulse bg-slate-100 rounded" />
          ) : absentStations.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">No absences recorded for the selected filters.</p>
          ) : (
            <div className="space-y-1">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 pb-1 border-b border-slate-100 text-xs font-medium text-slate-400 px-1">
                <span>Station</span>
                <span className="text-right">Staff</span>
                <span className="text-right">Days</span>
                <span className="w-4" />
              </div>
              {absentStations.map((station) => (
                <div key={station.campus_id}>
                  <button
                    className="w-full grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-1 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                    onClick={() => setExpandedAbsentStation(expandedAbsentStation === station.campus_id ? null : station.campus_id)}
                  >
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{station.campus_name}</span>
                    <span className="text-right font-semibold text-rose-600 text-sm">{station.total_absent_staff}</span>
                    <span className="text-right text-slate-500 text-xs">{station.total_absent_days}d</span>
                    <span className="text-slate-400">
                      {expandedAbsentStation === station.campus_id
                        ? <ChevronDown size={13} />
                        : <ChevronRight size={13} />}
                    </span>
                  </button>
                  {expandedAbsentStation === station.campus_id && (
                    <div className="ml-4 mb-2 rounded-md bg-slate-50 dark:bg-slate-700/40 divide-y divide-slate-100 dark:divide-slate-700">
                      {station.staff.map((st) => (
                        <div key={st.employee_id} className="flex items-start justify-between gap-3 px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{st.employee_name}</p>
                            <p className="text-xs text-slate-400">{st.staff_no}</p>
                            {st.reasons.length > 0 && (
                              <p className="text-xs text-slate-500 mt-0.5">{st.reasons.join(' · ')}</p>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-rose-600 shrink-0 mt-0.5">{st.total_absent_days}d</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Staff Table */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-semibold text-slate-700">Staff Performance &amp; Attendance</h2>
            <div className="analytics-no-print flex gap-1.5">
              {(['all', 'low_perf', 'low_att'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveStaffFilter(f)}
                  className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                    activeStaffFilter === f
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {f === 'all' ? 'All Staff' : f === 'low_perf' ? '⚠ Low Performance' : '⚠ Low Attendance'}
                </button>
              ))}
            </div>
          </div>
          {loadingStaff ? <div className="h-32 animate-pulse bg-slate-100 rounded" /> : filteredStaff.length === 0 ? (
            <p className="text-slate-400 text-sm py-4 text-center">No staff records for selected filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 pr-3 font-medium text-slate-500">Staff</th>
                    <th className="text-left py-2 pr-3 font-medium text-slate-500">Station</th>
                    <th className="text-right py-2 pr-3 font-medium text-slate-500">Performance</th>
                    <th className="text-right py-2 pr-3 font-medium text-slate-500">Attendance</th>
                    <th className="text-left py-2 font-medium text-slate-500">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map((s) => (
                    <tr
                      key={`${s.staff_id}-${s.year}`}
                      className={`border-b border-slate-50 hover:bg-slate-50 ${s.alert_low_perf || s.alert_low_att ? 'bg-rose-50/40' : ''}`}
                    >
                      <td className="py-2 pr-3">
                        <p className="font-medium text-slate-800">{s.employee_name}</p>
                        <p className="text-xs text-slate-400">{s.staff_no}</p>
                      </td>
                      <td className="py-2 pr-3 text-slate-600 text-xs">{s.campus_name}</td>
                      <td className="py-2 pr-3 text-right">
                        <span className={`font-semibold ${s.alert_low_perf ? 'text-rose-600' : s.performance_pct >= 80 ? 'text-emerald-600' : 'text-slate-700'}`}>
                          {pct(s.performance_pct)}
                        </span>
                        {s.alert_low_perf && <AlertTriangle size={12} className="inline ml-1 text-rose-500" />}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <span className={`font-semibold ${s.alert_low_att ? 'text-rose-600' : s.attendance_pct != null && s.attendance_pct >= 85 ? 'text-emerald-600' : 'text-slate-700'}`}>
                          {pct(s.attendance_pct)}
                        </span>
                        {s.alert_low_att && <AlertTriangle size={12} className="inline ml-1 text-rose-500" />}
                      </td>
                      <td className="py-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {s.performance_cat ?? '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-slate-400 mt-2">
                Showing {filteredStaff.length} of {staffData.length} staff. Alerts: &lt;60% performance or &lt;75% attendance.
              </p>
            </div>
          )}
        </div>

      </div>{/* /analytics-printable */}
    </>
  );
}
