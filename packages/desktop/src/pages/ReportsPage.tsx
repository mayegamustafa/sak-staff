import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';

type ReportTab = 'summary' | 'campus' | 'transfers' | 'performance';

/** Branded letterhead shown at the top of every printable report */
function ReportHeader({ title }: { title: string }) {
  return (
    <div className="hidden print:flex items-center gap-4 pb-4 mb-6 border-b-2 border-gray-800">
      <img src="/sak.jpg" alt="SAK" className="w-16 h-16 object-cover rounded" />
      <div>
        <p className="text-lg font-extrabold uppercase tracking-wide text-gray-900">
          Sir Apollo Kaggwa Schools
        </p>
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Since 1996</p>
        <p className="text-sm font-semibold text-gray-700">{title}</p>
      </div>
      <div className="ml-auto text-right text-xs text-gray-400">
        <p>Generated: {new Date().toLocaleString()}</p>
        <p>SAK Staff Profiling System</p>
      </div>
    </div>
  );
}

const PRINT_STYLES = `
@media print {
  aside, button, .no-print { display: none !important; }
  main { overflow: visible !important; }
  body { background: white !important; color: black !important; }
  .card { background: white !important; border: 1px solid #e2e8f0 !important; }
  .text-white, .text-slate-100, .text-slate-200, .text-slate-300 { color: #1a202c !important; }
  .text-slate-400, .text-slate-500 { color: #718096 !important; }
  .text-brand-400 { color: #2563eb !important; }
  .bg-slate-800, .bg-slate-800\\/60, .bg-slate-800\\/40 { background: #f7fafc !important; }
  .divide-y > * { border-color: #e2e8f0 !important; }
}
`;

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('summary');

  const tabTitles: Record<ReportTab, string> = {
    summary: 'Staff Overview Report',
    campus: 'Staff per Station Report',
    transfers: 'Transfers History Report',
    performance: 'Performance Ranking Report',
  };

  const handlePrint = () => {
    const style = document.createElement('style');
    style.textContent = PRINT_STYLES;
    document.head.appendChild(style);
    window.print();
    setTimeout(() => document.head.removeChild(style), 1000);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Reports & Analytics</h1>
          <p className="text-slate-400 text-sm mt-0.5">Staff insights and data exports</p>
        </div>
        <button
          onClick={handlePrint}
          className="no-print shrink-0 flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors"
        >
          <Printer size={14} />
          Print Report
        </button>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 no-print overflow-x-auto">
        {(['summary', 'campus', 'transfers', 'performance'] as ReportTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t === 'summary' ? 'Overview' : t}
          </button>
        ))}
      </div>

      <ReportHeader title={tabTitles[tab]} />

      {tab === 'summary'     && <SummaryReport />}
      {tab === 'campus'      && <CampusReport />}
      {tab === 'transfers'   && <TransfersReport />}
      {tab === 'performance' && <PerformanceRankingReport />}
    </div>
  );
}

function SummaryReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'summary'],
    queryFn: () => window.sakAPI.reports.summary(),
  });
  const s = data as {
    totalStaff?: number; activeStaff?: number;
    contractCounts?: { contract_type: string; count: number }[];
  } | undefined;

  if (isLoading) return <p className="text-slate-500 text-sm">Loading…</p>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="card text-center">
        <p className="text-4xl font-bold text-brand-400">{s?.totalStaff ?? 0}</p>
        <p className="text-slate-400 text-sm mt-1">Total Staff</p>
      </div>
      <div className="card text-center">
        <p className="text-4xl font-bold text-emerald-400">{s?.activeStaff ?? 0}</p>
        <p className="text-slate-400 text-sm mt-1">Active Staff</p>
      </div>
      <div className="card">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-3 font-medium">Contract Types</p>
        {(s?.contractCounts ?? []).map((c) => (
          <div key={c.contract_type} className="flex justify-between text-sm mb-1">
            <span className="text-slate-400 capitalize">{c.contract_type}</span>
            <span className="text-slate-800 dark:text-slate-100 font-semibold">{c.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CampusReport() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['reports', 'staff-per-campus'],
    queryFn: () => window.sakAPI.reports.staffPerCampus(),
  });
  const rows = data as { name: string; code: string; staff_count: number }[];

  if (isLoading) return <p className="text-slate-500 text-sm">Loading…</p>;

  const max = Math.max(...rows.map((r) => r.staff_count), 1);

  return (
    <div className="card space-y-4">
      <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Staff per Station</h2>
      {rows.map((r) => (
        <div key={r.code} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-slate-700 dark:text-slate-200">{r.name}</span>
            <span className="text-brand-400 font-semibold">{r.staff_count}</span>
          </div>
          <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-600 rounded-full transition-all"
              style={{ width: `${(r.staff_count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TransfersReport() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['reports', 'transfers', year],
    queryFn: () => window.sakAPI.reports.transfersHistory(year),
  });
  const rows = data as { id:string; type: string; status: string; employee_name: string; staff_no: string; from_campus: string; to_campus: string; effective_date: string }[];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          className="input w-auto"
          value={year}
          onChange={(e) => { setYear(e.target.value); refetch(); }}
        >
          {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="text-slate-400 text-sm">{rows.length} transfer(s)</span>
      </div>

      {isLoading && <p className="text-slate-500 text-sm">Loading…</p>}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
            <tr>
              {['Employee', 'Type', 'From', 'To', 'Date', 'Status'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="px-4 py-3">
                  <p className="text-slate-800 dark:text-slate-100">{r.employee_name}</p>
                  <p className="text-xs text-brand-400 font-mono">{r.staff_no}</p>
                </td>
                <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-300">{r.type}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{r.from_campus}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{r.to_campus}</td>
                <td className="px-4 py-3 text-slate-400">{r.effective_date?.slice(0, 10)}</td>
                <td className="px-4 py-3 capitalize"><span className={`badge-${r.status === 'approved' ? 'active' : 'pending'}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PerformanceRankingReport() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['reports', 'performance-ranking'],
    queryFn: () => window.sakAPI.reports.performanceRanking(),
  });
  const rows = data as { employee_name: string; staff_no: string; avg_score: number; appraisal_count: number }[];

  if (isLoading) return <p className="text-slate-500 text-sm">Loading…</p>;

  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
          <tr>
            {['Rank', 'Staff', 'Avg Score', 'Appraisals'].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {rows.map((r, i) => (
            <tr key={r.staff_no} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <td className="px-4 py-3 text-slate-500 font-mono">#{i + 1}</td>
              <td className="px-4 py-3">
                <p className="text-slate-800 dark:text-slate-100">{r.employee_name}</p>
                <p className="text-xs text-brand-400 font-mono">{r.staff_no}</p>
              </td>
              <td className="px-4 py-3">
                <span className="text-brand-400 font-bold text-lg">{Number(r.avg_score).toFixed(1)}</span>
                <span className="text-slate-500 text-xs">/5</span>
              </td>
              <td className="px-4 py-3 text-slate-400">{r.appraisal_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
