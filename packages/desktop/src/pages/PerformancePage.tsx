import { useState, useEffect } from 'react';
import { FaEye, FaPrint, FaTrash } from 'react-icons/fa';
import { FaEdit } from 'react-icons/fa';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppraisalTemplateManager from '../components/AppraisalTemplateManager';
import StaffAppraisalForm from '../components/StaffAppraisalForm';
import AppraisalPrintReport from '../components/AppraisalPrintReport';

type SubTab = 'appraisals' | 'templates';

export default function PerformancePage() {
  const [subTab, setSubTab] = useState<SubTab>('appraisals');
  const [staffList, setStaffList] = useState<any[]>([]);
  const [printAppraisal, setPrintAppraisal] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<string>('');
  const queryClient = useQueryClient();

  useEffect(() => {
    (async () => {
      const list = await (window.sakAPI?.employees?.list?.() ?? []);
      if (Array.isArray(list)) setStaffList(list);
      else if (list && Array.isArray((list as any).data)) setStaffList((list as any).data);
      else setStaffList([]);
    })();
  }, []);

  // Fetch new dynamic appraisals
  const { data: appraisals = [], isLoading } = useQuery<any[]>({
    queryKey: ['staff-appraisals', yearFilter],
    queryFn: () => window.sakAPI.staffAppraisals.list(yearFilter ? { year: yearFilter } : undefined) as any,
  });

  function handleDeleteAppraisal(id: string) {
    if (!window.confirm('Are you sure you want to delete this appraisal?')) return;
    window.sakAPI.staffAppraisals.delete(id).then(() => {
      queryClient.invalidateQueries({ queryKey: ['staff-appraisals'] });
    });
  }

  async function handleViewPrint(a: any) {
    // Load full appraisal with template & scores for printing
    try {
      const full = await window.sakAPI.staffAppraisals.get(a.id);
      // Try to find previous year for comparison
      const allForStaff = appraisals.filter((x: any) => x.employee_id === a.employee_id && x.year < a.year);
      const prevYear = allForStaff.length ? allForStaff.reduce((best: any, x: any) => (!best || x.year > best.year) ? x : best, null) : null;
      setPrintAppraisal({ ...(full as any), _prevYear: prevYear });
    } catch {
      setPrintAppraisal(a);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Staff Performance Appraisals</h1>
        <p className="text-slate-400 text-sm mt-0.5">Dynamic appraisal system with termly scoring and annual results</p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {([
          { key: 'appraisals' as SubTab, label: 'Appraisals' },
          { key: 'templates' as SubTab, label: 'Templates' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              subTab === key
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Templates sub-tab */}
      {subTab === 'templates' && <AppraisalTemplateManager />}

      {/* Appraisals sub-tab */}
      {subTab === 'appraisals' && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500">Year:</label>
              <input
                type="number"
                className="input w-24"
                placeholder="All"
                value={yearFilter}
                onChange={e => setYearFilter(e.target.value)}
                min={2000}
                max={2100}
              />
            </div>
            <button className="btn btn-primary" onClick={() => { setEditId(null); setShowForm(true); }}>
              New Appraisal
            </button>
          </div>

          {showForm && (
            <StaffAppraisalForm
              editId={editId}
              onClose={() => { setShowForm(false); setEditId(null); }}
            />
          )}

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    {['Staff', 'Year', 'Term I', 'Term II', 'Term III', 'Annual Avg', 'Category', 'Actions'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {isLoading && <tr><td colSpan={8} className="text-center py-10 text-slate-500">Loading…</td></tr>}
                  {!isLoading && !appraisals.length && <tr><td colSpan={8} className="text-center py-10 text-slate-400">No appraisals yet</td></tr>}
                  {appraisals.map((a: any) => {
                    const staff = staffList.find(s => s.id === a.employee_id);
                    const termI = a.terms?.find((t: any) => t.term === 'I');
                    const termII = a.terms?.find((t: any) => t.term === 'II');
                    const termIII = a.terms?.find((t: any) => t.term === 'III');

                    const categoryClass = (label: string) =>
                      label === 'ACHIEVED' ? 'bg-emerald-900/60 text-emerald-400' :
                      label === 'PROMISING' ? 'bg-amber-900/60 text-amber-400' :
                      'bg-red-900/60 text-red-400';

                    return (
                      <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                          {a.employee_name || (staff ? `${staff.first_name} ${staff.last_name}` : '—')}
                          {(a.staff_no || staff?.staff_no) && (
                            <span className="text-xs text-slate-400 ml-1">({a.staff_no || staff.staff_no})</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{a.year}</td>
                        <td className="px-4 py-3">
                          {termI ? <span className="text-brand-400 font-medium">{Number(termI.term_score).toFixed(1)}%</span> : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {termII ? <span className="text-brand-400 font-medium">{Number(termII.term_score).toFixed(1)}%</span> : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {termIII ? <span className="text-brand-400 font-medium">{Number(termIII.term_score).toFixed(1)}%</span> : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {a.annual_average !== null ? (
                            <span className="text-brand-400 font-bold">{Number(a.annual_average).toFixed(1)}%</span>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {a.category_label ? (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${categoryClass(a.category_label)}`}>{a.category_label}</span>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 flex gap-2">
                          <button className="btn btn-xs btn-outline" title="View" onClick={() => handleViewPrint(a)}>
                            <FaEye />
                          </button>
                          <button className="btn btn-xs btn-secondary" title="Print" onClick={() => handleViewPrint(a)}>
                            <FaPrint />
                          </button>
                          <button className="btn btn-xs btn-info" title="Edit" onClick={() => { setEditId(a.id); setShowForm(true); }}>
                            <FaEdit />
                          </button>
                          <button className="btn btn-xs btn-danger" title="Delete" onClick={() => handleDeleteAppraisal(a.id)}>
                            <FaTrash />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Print report modal */}
      {printAppraisal && (
        <AppraisalPrintReport
          appraisal={printAppraisal}
          staffList={staffList}
          onClose={() => setPrintAppraisal(null)}
        />
      )}
    </div>
  );
}
