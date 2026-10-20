import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, ChevronDown, ChevronUp, X as XIcon } from 'lucide-react';

interface TemplateCategory {
  name: string;
  maxScore: number;
  weight: number | null;
  orderIndex: number;
  items: { name: string; maxScore: number; orderIndex: number }[];
}

interface Template {
  id: string;
  name: string;
  year: number | null;
  is_active: boolean;
  categories: {
    id: string;
    name: string;
    max_score: number;
    weight: number | null;
    order_index: number;
    items: { id: string; name: string; max_score: number; order_index: number }[];
  }[];
}

export default function AppraisalTemplateManager() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ['appraisal-templates'],
    queryFn: () => window.sakAPI.appraisalTemplates.list() as any,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => window.sakAPI.appraisalTemplates.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appraisal-templates'] }),
  });

  function handleEdit(t: Template) {
    setEditingId(t.id);
    setShowForm(true);
  }

  function handleDelete(id: string) {
    if (!window.confirm('Delete this template? This cannot be undone.')) return;
    deleteMutation.mutate(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Appraisal Templates</h2>
          <p className="text-slate-400 text-xs mt-0.5">Define appraisal scoring structure</p>
        </div>
        <button className="btn btn-primary flex items-center gap-1" onClick={() => { setEditingId(null); setShowForm(true); }}>
          <Plus size={14} /> New Template
        </button>
      </div>

      {isLoading && <p className="text-slate-500 text-sm">Loading…</p>}

      {!isLoading && !templates.length && (
        <div className="card text-center py-10 text-slate-400 text-sm">
          No templates yet. Create one to get started.
        </div>
      )}

      <div className="space-y-3">
        {templates.map((t) => (
          <TemplateCard key={t.id} template={t} onEdit={() => handleEdit(t)} onDelete={() => handleDelete(t.id)} />
        ))}
      </div>

      {showForm && (
        <TemplateFormModal
          editId={editingId}
          onClose={() => { setShowForm(false); setEditingId(null); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  Template Card
// ─────────────────────────────────────────────

function TemplateCard({ template, onEdit, onDelete }: { template: Template; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setExpanded(!expanded)} className="text-slate-400 hover:text-slate-600">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{template.name}</h3>
            <p className="text-xs text-slate-400">
              {template.year ? `Year: ${template.year}` : 'Reusable (no year)'} · {template.categories.length} categories
              · Total max: {template.categories.reduce((s, c) => s + Number(c.max_score), 0)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${template.is_active ? 'bg-emerald-900/60 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
            {template.is_active ? 'Active' : 'Inactive'}
          </span>
          <button className="btn btn-xs btn-outline" onClick={onEdit}><Edit2 size={12} /></button>
          <button className="btn btn-xs btn-danger" onClick={onDelete}><Trash2 size={12} /></button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 border-t border-slate-200 dark:border-slate-800 pt-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 uppercase text-left">
                <th className="pb-1 pr-4">#</th>
                <th className="pb-1 pr-4">Category</th>
                <th className="pb-1 pr-4">Max Score</th>
                <th className="pb-1 pr-4">Weight</th>
                <th className="pb-1">Sub-items</th>
              </tr>
            </thead>
            <tbody>
              {template.categories.map((c, i) => (
                <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800/50">
                  <td className="py-1 pr-4 text-slate-400">{i + 1}</td>
                  <td className="py-1 pr-4 font-medium text-slate-700 dark:text-slate-200">{c.name}</td>
                  <td className="py-1 pr-4 text-slate-600 dark:text-slate-300">{c.max_score}</td>
                  <td className="py-1 pr-4 text-slate-500">{c.weight ?? '—'}</td>
                  <td className="py-1 text-slate-500">
                    {c.items.length ? c.items.map(it => it.name).join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  Template Form Modal
// ─────────────────────────────────────────────

function TemplateFormModal({ editId, onClose }: { editId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [year, setYear] = useState<string>('');
  const [isActive, setIsActive] = useState(true);
  const [categories, setCategories] = useState<TemplateCategory[]>([
    { name: 'Quantitative', maxScore: 60, weight: null, orderIndex: 0, items: [] },
    { name: 'Qualitative', maxScore: 20, weight: null, orderIndex: 1, items: [] },
    { name: 'Instructional', maxScore: 20, weight: null, orderIndex: 2, items: [] },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load existing template for editing
  const { data: editData, isLoading: loadingEdit } = useQuery({
    queryKey: ['appraisal-template', editId],
    queryFn: () => window.sakAPI.appraisalTemplates.get(editId!) as any,
    enabled: !!editId,
  });

  React.useEffect(() => {
    if (editData) {
      const data = editData as any;
      setName(data.name);
      setYear(data.year?.toString() || '');
      setIsActive(data.is_active);
      setCategories(
        (data.categories || []).map((c: any, i: number) => ({
          name: c.name,
          maxScore: Number(c.max_score),
          weight: c.weight ? Number(c.weight) : null,
          orderIndex: c.order_index ?? i,
          items: (c.items || []).map((it: any, j: number) => ({
            name: it.name,
            maxScore: Number(it.max_score),
            orderIndex: it.order_index ?? j,
          })),
        }))
      );
    }
  }, [editData]);

  function addCategory() {
    setCategories([...categories, { name: '', maxScore: 0, weight: null, orderIndex: categories.length, items: [] }]);
  }

  function removeCategory(idx: number) {
    setCategories(categories.filter((_, i) => i !== idx).map((c, i) => ({ ...c, orderIndex: i })));
  }

  function updateCategory(idx: number, field: string, value: any) {
    setCategories(categories.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }

  function addItem(catIdx: number) {
    const updated = [...categories];
    updated[catIdx] = {
      ...updated[catIdx],
      items: [...updated[catIdx].items, { name: '', maxScore: 0, orderIndex: updated[catIdx].items.length }],
    };
    setCategories(updated);
  }

  function removeItem(catIdx: number, itemIdx: number) {
    const updated = [...categories];
    updated[catIdx] = {
      ...updated[catIdx],
      items: updated[catIdx].items.filter((_, i) => i !== itemIdx).map((it, i) => ({ ...it, orderIndex: i })),
    };
    setCategories(updated);
  }

  function updateItem(catIdx: number, itemIdx: number, field: string, value: any) {
    const updated = [...categories];
    updated[catIdx] = {
      ...updated[catIdx],
      items: updated[catIdx].items.map((it, i) => i === itemIdx ? { ...it, [field]: value } : it),
    };
    setCategories(updated);
  }

  function moveCategory(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= categories.length) return;
    const arr = [...categories];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setCategories(arr.map((c, i) => ({ ...c, orderIndex: i })));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    if (!categories.length) { setError('At least one category is required'); return; }
    for (const c of categories) {
      if (!c.name.trim() || c.maxScore <= 0) { setError('All categories need a name and max score > 0'); return; }
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        year: year ? parseInt(year) : null,
        isActive,
        categories: categories.map((c) => ({
          name: c.name.trim(),
          maxScore: c.maxScore,
          weight: c.weight,
          orderIndex: c.orderIndex,
          items: c.items.map((it) => ({
            name: it.name.trim(),
            maxScore: it.maxScore,
            orderIndex: it.orderIndex,
          })),
        })),
      };
      if (editId) {
        await window.sakAPI.appraisalTemplates.update(editId, payload);
      } else {
        await window.sakAPI.appraisalTemplates.create(payload);
      }
      queryClient.invalidateQueries({ queryKey: ['appraisal-templates'] });
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to save template');
    } finally {
      setLoading(false);
    }
  }

  if (loadingEdit) return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-lg">Loading…</div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-2">
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4 relative">
        <button type="button" className="absolute top-2 right-2 text-xl text-slate-500 hover:text-slate-800" onClick={onClose}>&times;</button>
        <h2 className="text-lg font-bold">{editId ? 'Edit Template' : 'New Appraisal Template'}</h2>

        {error && <div className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium">Template Name</label>
            <input type="text" className="input w-full" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Standard Teacher Appraisal" required />
          </div>
          <div>
            <label className="block text-sm font-medium">Year <span className="text-slate-400">(optional)</span></label>
            <input type="number" className="input w-full" value={year} onChange={e => setYear(e.target.value)} placeholder="2026" min="2000" max="2100" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="tmpl-active" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
          <label htmlFor="tmpl-active" className="text-sm font-medium">Active</label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold">Categories</label>
            <button type="button" className="btn btn-xs btn-secondary flex items-center gap-1" onClick={addCategory}>
              <Plus size={12} /> Add Category
            </button>
          </div>

          <div className="space-y-3">
            {categories.map((cat, ci) => (
              <div key={ci} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50 dark:bg-slate-800/30">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex flex-col gap-0.5 text-slate-400">
                    <button type="button" onClick={() => moveCategory(ci, -1)} disabled={ci === 0}><ChevronUp size={12} /></button>
                    <button type="button" onClick={() => moveCategory(ci, 1)} disabled={ci === categories.length - 1}><ChevronDown size={12} /></button>
                  </div>
                  <input
                    type="text" className="input flex-1" placeholder="Category name"
                    value={cat.name} onChange={e => updateCategory(ci, 'name', e.target.value)} required
                  />
                  <input
                    type="number" className="input w-24" placeholder="Max" min="1"
                    value={cat.maxScore || ''} onChange={e => updateCategory(ci, 'maxScore', Number(e.target.value))} required
                  />
                  <input
                    type="number" className="input w-20" placeholder="Wt" step="0.1"
                    value={cat.weight ?? ''} onChange={e => updateCategory(ci, 'weight', e.target.value ? Number(e.target.value) : null)}
                  />
                  <button type="button" className="btn btn-xs btn-danger" onClick={() => removeCategory(ci)} disabled={categories.length === 1}>
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Sub-items */}
                {cat.items.length > 0 && (
                  <div className="ml-6 space-y-1 mb-2">
                    {cat.items.map((item, ii) => (
                      <div key={ii} className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 w-4">{ii + 1}.</span>
                        <input type="text" className="input flex-1 text-xs" placeholder="Item name" value={item.name} onChange={e => updateItem(ci, ii, 'name', e.target.value)} required />
                        <input type="number" className="input w-16 text-xs" placeholder="Max" min="0.1" step="0.1" value={item.maxScore || ''} onChange={e => updateItem(ci, ii, 'maxScore', Number(e.target.value))} required />
                        <button type="button" className="text-red-400 hover:text-red-600" onClick={() => removeItem(ci, ii)}><XIcon size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" className="text-xs text-brand-400 hover:text-brand-300 ml-6" onClick={() => addItem(ci)}>
                  + Add sub-item
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-400">
          Total max score: <strong>{categories.reduce((s, c) => s + c.maxScore, 0)}</strong>
        </div>

        <button type="submit" className="btn btn-primary w-full" disabled={loading}>
          {loading ? 'Saving…' : editId ? 'Update Template' : 'Create Template'}
        </button>
      </form>
    </div>
  );
}
