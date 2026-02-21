import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDate } from '@sak/shared';

export default function PerformancePage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['performance'],
    queryFn: () => window.sakAPI.performance.list(),
  });

  const appraisals = data as {
    id: string; employee_id: string; period: string; academic_year: string;
    overall_score: number; overall_rating: string; conducted_date: string;
    is_eligible_for_promotion: boolean;
  }[];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Performance Appraisals</h1>
        <p className="text-slate-400 text-sm mt-0.5">Staff evaluations, KPIs and promotion eligibility</p>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
            <tr>
              {['Period', 'Academic Year', 'Score', 'Rating', 'Eligible for Promotion', 'Date'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {isLoading && <tr><td colSpan={6} className="text-center py-10 text-slate-500">Loading…</td></tr>}
            {!isLoading && !appraisals.length && <tr><td colSpan={6} className="text-center py-10 text-slate-400">No appraisals yet</td></tr>}
            {appraisals.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <td className="px-4 py-3 capitalize text-slate-700 dark:text-slate-200">{a.period.replace('_', ' ')}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{a.academic_year}</td>
                <td className="px-4 py-3">
                  <span className="text-brand-400 font-bold">{Number(a.overall_score).toFixed(1)}</span>
                  <span className="text-slate-500">/5</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    a.overall_rating === 'Excellent' ? 'bg-emerald-900/60 text-emerald-400' :
                    a.overall_rating === 'Good' ? 'bg-brand-900/60 text-brand-400' :
                    a.overall_rating === 'Fair' ? 'bg-amber-900/60 text-amber-400' :
                    'bg-red-900/60 text-red-400'
                  }`}>{a.overall_rating}</span>
                </td>
                <td className="px-4 py-3">
                  {a.is_eligible_for_promotion
                    ? <span className="badge-active">Yes</span>
                    : <span className="badge-inactive">No</span>
                  }
                </td>
                <td className="px-4 py-3 text-slate-400">{formatDate(a.conducted_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
