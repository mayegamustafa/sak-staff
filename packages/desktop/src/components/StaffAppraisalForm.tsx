import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface TemplateCategory {
  id: string;
  name: string;
  max_score: number;
  weight: number | null;
  order_index: number;
  items: { id: string; name: string; max_score: number }[];
}

interface Template {
  id: string;
  name: string;
  year: number | null;
  is_active: boolean;
  categories: TemplateCategory[];
}

type TermLabel = 'I' | 'II' | 'III';

interface TermScores {
  [categoryId: string]: number;
}

interface Props {
  onClose: () => void;
  editId?: string | null;
  preSelectedEmployeeId?: string | null;
}

export default function StaffAppraisalForm({ onClose, editId, preSelectedEmployeeId }: Props) {
  const queryClient = useQueryClient();

  // Master data
  const [employees, setEmployees] = useState<any[]>([]);
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ['appraisal-templates'],
    queryFn: () => window.sakAPI.appraisalTemplates.list() as any,
  });

  // Load employees
  React.useEffect(() => {
    (async () => {
      const list = await (window.sakAPI?.employees?.list?.() ?? []);
      if (Array.isArray(list)) setEmployees(list);
      else if (list && Array.isArray((list as any).data)) setEmployees((list as any).data);
      else setEmployees([]);
    })();
  }, []);

  // Form state
  const [employeeId, setEmployeeId] = useState(preSelectedEmployeeId || '');
  const [templateId, setTemplateId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [activeTerm, setActiveTerm] = useState<TermLabel>('I');
  const [termScores, setTermScores] = useState<Record<TermLabel, TermScores>>({ I: {}, II: {}, III: {} });
  const [guidanceComment, setGuidanceComment] = useState('');
  const [otherObservations, setOtherObservations] = useState('');
  const [preparedBy, setPreparedBy] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Selected template
  const activeTemplates = templates.filter(t => t.is_active);
  const selectedTemplate = templates.find(t => t.id === templateId);
  const categories = selectedTemplate?.categories || [];

  // Load existing appraisal for edit
  const { data: editData } = useQuery({
    queryKey: ['staff-appraisal-edit', editId],
    queryFn: () => window.sakAPI.staffAppraisals.get(editId!) as any,
    enabled: !!editId,
  });

  React.useEffect(() => {
    if (editData) {
      const data = editData as any;
      setEmployeeId(data.employee_id);
      setTemplateId(data.template_id);
      setYear(data.year);
      setGuidanceComment(data.guidance_comment || '');
      setOtherObservations(data.other_observations || '');
      setPreparedBy(data.prepared_by || '');
      setApprovedBy(data.approved_by || '');
      if (data.terms) {
        const ts: Record<TermLabel, TermScores> = { I: {}, II: {}, III: {} };
        for (const t of data.terms) {
          if (t.scores) {
            for (const sc of t.scores) {
              ts[t.term as TermLabel][sc.category_id] = Number(sc.score);
            }
          }
        }
        setTermScores(ts);
      }
    }
  }, [editData]);

  // Compute stats for current term
  const termStats = useMemo(() => {
    const result: Record<TermLabel, { totalScored: number; totalMax: number; pct: number; category: string }> = {} as any;
    (['I', 'II', 'III'] as TermLabel[]).forEach(term => {
      const scores = termScores[term];
      let totalScored = 0;
      let totalMax = 0;
      for (const cat of categories) {
        const s = scores[cat.id];
        if (s !== undefined && s !== null) {
          totalScored += s;
          totalMax += Number(cat.max_score);
        }
      }
      const pct = totalMax > 0 ? Math.round((totalScored / totalMax) * 10000) / 100 : 0;
      const category = pct >= 75 ? 'ACHIEVED' : pct >= 50 ? 'PROMISING' : 'NEEDS IMPROVEMENT';
      result[term] = { totalScored, totalMax, pct, category };
    });
    return result;
  }, [termScores, categories]);

  // Annual average
  const annualStats = useMemo(() => {
    const filled = (['I', 'II', 'III'] as TermLabel[]).filter(t => termStats[t].totalMax > 0);
    if (!filled.length) return { avg: 0, category: '' };
    const avg = Math.round(filled.reduce((s, t) => s + termStats[t].pct, 0) / filled.length * 100) / 100;
    const category = avg >= 75 ? 'ACHIEVED' : avg >= 50 ? 'PROMISING' : 'NEEDS IMPROVEMENT';
    return { avg, category };
  }, [termStats]);

  function updateScore(term: TermLabel, categoryId: string, value: number) {
    setTermScores(prev => ({
      ...prev,
      [term]: { ...prev[term], [categoryId]: value },
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId) { setError('Select a staff member'); return; }
    if (!templateId) { setError('Select a template'); return; }

    // Build terms array (only include terms that have scores)
    const terms: { term: TermLabel; scores: { categoryId: string; score: number }[] }[] = [];
    for (const term of ['I', 'II', 'III'] as TermLabel[]) {
      const scores = termScores[term];
      const entries = Object.entries(scores).filter(([, v]) => v !== undefined && v !== null && v > 0);
      if (entries.length) {
        // Validate doesn't exceed max
        for (const [catId, score] of entries) {
          const cat = categories.find(c => c.id === catId);
          if (cat && score > Number(cat.max_score)) {
            setError(`Term ${term}: Score ${score} exceeds max ${cat.max_score} for "${cat.name}"`);
            return;
          }
        }
        terms.push({
          term,
          scores: entries.map(([categoryId, score]) => ({ categoryId, score })),
        });
      }
    }

    if (!terms.length) { setError('Enter scores for at least one term'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        employeeId,
        templateId,
        year,
        guidanceComment: guidanceComment || undefined,
        otherObservations: otherObservations || undefined,
        preparedBy: preparedBy || undefined,
        approvedBy: approvedBy || undefined,
        terms,
      };

      if (editId) {
        await window.sakAPI.staffAppraisals.update(editId, payload);
      } else {
        await window.sakAPI.staffAppraisals.create(payload);
      }
      queryClient.invalidateQueries({ queryKey: ['staff-appraisals'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-2">
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto space-y-4 relative">
        <button type="button" className="absolute top-2 right-2 text-xl text-slate-500" onClick={onClose}>&times;</button>
        <h2 className="text-lg font-bold">{editId ? 'Edit Staff Appraisal' : 'New Staff Appraisal'}</h2>

        {error && <div className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded">{error}</div>}

        {/* Staff + Template + Year */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium">Staff</label>
            <select className="input w-full" value={employeeId} onChange={e => setEmployeeId(e.target.value)} required disabled={!!editId}>
              <option value="">Select staff…</option>
              {employees.map((emp: any) => (
                <option key={emp.id} value={emp.id}>
                  {emp.staff_no ? `${emp.staff_no} - ` : ''}{emp.first_name} {emp.last_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Template</label>
            <select className="input w-full" value={templateId} onChange={e => setTemplateId(e.target.value)} required disabled={!!editId}>
              <option value="">Select template…</option>
              {activeTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.year ? ` (${t.year})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Year</label>
            <input type="number" className="input w-full" value={year} onChange={e => setYear(Number(e.target.value))} min={2000} max={2100} required disabled={!!editId} />
          </div>
        </div>

        {/* Term tabs */}
        {selectedTemplate && (
          <>
            <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
              {(['I', 'II', 'III'] as TermLabel[]).map(term => {
                const stat = termStats[term];
                return (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setActiveTerm(term)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTerm === term ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Term {term}
                    {stat.totalMax > 0 && (
                      <span className="ml-2 text-xs text-slate-400">({stat.pct}%)</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Score entry for active term */}
            <div className="space-y-2">
              {categories.map(cat => {
                const score = termScores[activeTerm][cat.id] ?? '';
                return (
                  <div key={cat.id} className="flex items-center gap-3">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200 flex-1 min-w-0">{cat.name}</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        className="input w-20 text-center"
                        min={0}
                        max={cat.max_score}
                        step="0.1"
                        value={score}
                        onChange={e => updateScore(activeTerm, cat.id, Number(e.target.value))}
                        placeholder="0"
                      />
                      <span className="text-xs text-slate-400">/ {cat.max_score}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Term summary */}
            <div className="bg-slate-50 dark:bg-slate-800/40 rounded p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Term {activeTerm} Score:</span>
                <span className="font-bold text-brand-400">
                  {termStats[activeTerm].totalScored} / {termStats[activeTerm].totalMax}
                  {termStats[activeTerm].totalMax > 0 && ` = ${termStats[activeTerm].pct}%`}
                </span>
              </div>
              {termStats[activeTerm].totalMax > 0 && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-slate-500">Category:</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    termStats[activeTerm].category === 'ACHIEVED' ? 'bg-emerald-900/60 text-emerald-400' :
                    termStats[activeTerm].category === 'PROMISING' ? 'bg-amber-900/60 text-amber-400' :
                    'bg-red-900/60 text-red-400'
                  }`}>{termStats[activeTerm].category}</span>
                </div>
              )}
            </div>

            {/* Summary table across all terms */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Summary</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60">
                    <tr>
                      <th className="text-left px-3 py-2 text-slate-400">Term</th>
                      {categories.map(c => (
                        <th key={c.id} className="text-left px-3 py-2 text-slate-400">{c.name}</th>
                      ))}
                      <th className="text-left px-3 py-2 text-slate-400">Total %</th>
                      <th className="text-left px-3 py-2 text-slate-400">Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(['I', 'II', 'III'] as TermLabel[]).map(term => (
                      <tr key={term} className="border-t border-slate-200 dark:border-slate-800">
                        <td className="px-3 py-2 font-medium">{term}</td>
                        {categories.map(c => (
                          <td key={c.id} className="px-3 py-2">
                            {termScores[term][c.id] !== undefined ? `${termScores[term][c.id]}/${c.max_score}` : '—'}
                          </td>
                        ))}
                        <td className="px-3 py-2 font-bold text-brand-400">{termStats[term].totalMax > 0 ? `${termStats[term].pct}%` : '—'}</td>
                        <td className="px-3 py-2">
                          {termStats[term].totalMax > 0 ? (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              termStats[term].category === 'ACHIEVED' ? 'bg-emerald-900/60 text-emerald-400' :
                              termStats[term].category === 'PROMISING' ? 'bg-amber-900/60 text-amber-400' :
                              'bg-red-900/60 text-red-400'
                            }`}>{termStats[term].category}</span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-300 dark:border-slate-700 font-semibold">
                      <td className="px-3 py-2" colSpan={categories.length + 1}>Annual Average</td>
                      <td className="px-3 py-2 text-brand-400">{annualStats.avg > 0 ? `${annualStats.avg}%` : '—'}</td>
                      <td className="px-3 py-2">
                        {annualStats.avg > 0 ? (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            annualStats.category === 'ACHIEVED' ? 'bg-emerald-900/60 text-emerald-400' :
                            annualStats.category === 'PROMISING' ? 'bg-amber-900/60 text-amber-400' :
                            'bg-red-900/60 text-red-400'
                          }`}>{annualStats.category}</span>
                        ) : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Comments */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">Guidance, Supporting & Assistance</label>
            <textarea className="input w-full" rows={3} value={guidanceComment} onChange={e => setGuidanceComment(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium">Other Observations</label>
            <textarea className="input w-full" rows={3} value={otherObservations} onChange={e => setOtherObservations(e.target.value)} />
          </div>
        </div>

        {/* Footer fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">Prepared By</label>
            <input type="text" className="input w-full" value={preparedBy} onChange={e => setPreparedBy(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium">Approved By</label>
            <input type="text" className="input w-full" value={approvedBy} onChange={e => setApprovedBy(e.target.value)} />
          </div>
        </div>

        <button type="submit" className="btn btn-primary w-full" disabled={saving}>
          {saving ? 'Saving…' : editId ? 'Update Appraisal' : 'Save Appraisal'}
        </button>
      </form>
    </div>
  );
}
