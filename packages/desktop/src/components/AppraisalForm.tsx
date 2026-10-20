
import React, { useState, useEffect, type FC } from 'react';

interface AppraisalFormProps {
  onSubmit: (data: any) => void;
  onClose: () => void;
  initialData?: any;
}

interface KPI {
  description: string;
  target: string;
  actualAchievement: string;
  weight: number;
  score: number;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  staff_no?: string;
}

/** employees.list() returns either a bare array or a paginated envelope. */
type EmployeeListResult = Employee[] | { data?: Employee[] } | null | undefined;

function toEmployeeArray(list: EmployeeListResult): Employee[] {
  if (Array.isArray(list)) return list;
  if (list && Array.isArray(list.data)) return list.data;
  return [];
}

const AppraisalForm: FC<AppraisalFormProps> = ({ onSubmit, onClose, initialData }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState(initialData?.employee_id || '');
  const [supervisors, setSupervisors] = useState<Employee[]>([]);
  const [supervisorId, setSupervisorId] = useState(initialData?.supervisor_id || '');
  const [period, setPeriod] = useState(initialData?.period || 'annual');
  const [kpis, setKpis] = useState<KPI[]>(initialData?.kpis || [{ description: '', target: '', actualAchievement: '', weight: 100, score: 3 }]);
  const [academicYear, setAcademicYear] = useState(initialData?.academic_year || '');
  const [conductedDate, setConductedDate] = useState(initialData?.conducted_date || '');
  const [overallScore, setOverallScore] = useState(initialData?.overall_score || 3);
  const [overallRating, setOverallRating] = useState(initialData?.overall_rating || 'Good');
  const [isEligibleForPromotion, setIsEligibleForPromotion] = useState(initialData?.is_eligible_for_promotion || false);
  const [supervisorComments, setSupervisorComments] = useState(initialData?.supervisor_comment || '');
  const [employeeComments, setEmployeeComments] = useState(initialData?.supervisee_comment || '');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = (await (window.sakAPI?.employees?.list?.() ?? [])) as EmployeeListResult;
        setEmployees(toEmployeeArray(list));
      } catch {
        setEmployees([]);
      }
    })();
  }, []);

  // Fetch supervisors (for now, pick other staff members)
  useEffect(() => {
    (async () => {
      try {
        const list = (await (window.sakAPI?.employees?.list?.() ?? [])) as EmployeeListResult;
        let emps = toEmployeeArray(list);
        // Exclude the selected staff member from supervisor list
        if (employeeId) {
          emps = emps.filter((emp) => emp.id !== employeeId);
        }
        setSupervisors(emps);
      } catch {
        setSupervisors([]);
      }
    })();
  }, [employeeId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!kpis.length || kpis.some(kpi => !kpi.description || !kpi.target || !kpi.actualAchievement)) {
      alert('Please fill in at least one complete KPI.');
      return;
    }
    onSubmit({
      employeeId,
      supervisorId,
      period,
      academicYear,
      conductedDate,
      overallScore,
      overallRating,
      isEligibleForPromotion,
      supervisorComments,
      employeeComments,
      kpis,
      file,
    });
  }

  function handleKpiChange(idx: number, field: keyof KPI, value: string | number) {
    setKpis(kpis => kpis.map((k, i) => i === idx ? { ...k, [field]: value } : k));
  }
  function addKpi() {
    setKpis([...kpis, { description: '', target: '', actualAchievement: '', weight: 0, score: 3 }]);
  }
  function removeKpi(idx: number) {
    if (kpis.length === 1) return;
    setKpis(kpis => kpis.filter((_, i) => i !== idx));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-2">
      <form
        className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-lg shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4 relative"
        style={{ maxHeight: '90vh' }}
        onSubmit={handleSubmit}
      >
        <button type="button" className="absolute top-2 right-2 text-xl" onClick={onClose}>&times;</button>
        <h2 className="text-lg font-bold mb-2">Add Staff Appraisal</h2>
        <div className="mb-2">
          <label className="block text-sm font-medium">Staff to Appraise</label>
          <select
            value={employeeId}
            onChange={e => setEmployeeId(e.target.value)}
            className="input w-full"
            required
          >
            <option value="">Select staff…</option>
            {Array.isArray(employees) && employees.length > 0 && employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.staff_no ? `${emp.staff_no} - ` : ''}{emp.first_name} {emp.last_name}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-2">
          <label className="block text-sm font-medium">Supervisor</label>
          <select
            value={supervisorId}
            onChange={e => setSupervisorId(e.target.value)}
            className="input w-full"
            required
          >
            <option value="">Select supervisor…</option>
            {Array.isArray(supervisors) && supervisors.length > 0 && supervisors.map(sup => (
              <option key={sup.id} value={sup.id}>
                {sup.staff_no ? `${sup.staff_no} - ` : ''}{sup.first_name} {sup.last_name}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-2">
          <label className="block text-sm font-medium">KPIs (at least one required)</label>
          {kpis.map((kpi, idx) => (
            <div key={idx} className="border rounded p-2 mb-2 bg-slate-50 dark:bg-slate-800/30">
              <div className="flex gap-2 mb-1">
                <input
                  type="text"
                  className="input flex-1"
                  placeholder="Description"
                  value={kpi.description}
                  onChange={e => handleKpiChange(idx, 'description', e.target.value)}
                  required
                />
                <input
                  type="text"
                  className="input flex-1"
                  placeholder="Target"
                  value={kpi.target}
                  onChange={e => handleKpiChange(idx, 'target', e.target.value)}
                  required
                />
              </div>
              <div className="flex gap-2 mb-1">
                <input
                  type="text"
                  className="input flex-1"
                  placeholder="Actual Achievement"
                  value={kpi.actualAchievement}
                  onChange={e => handleKpiChange(idx, 'actualAchievement', e.target.value)}
                  required
                />
                <input
                  type="number"
                  className="input w-24"
                  placeholder="Weight %"
                  min={0}
                  max={100}
                  value={kpi.weight}
                  onChange={e => handleKpiChange(idx, 'weight', Number(e.target.value))}
                  required
                />
                <input
                  type="number"
                  className="input w-20"
                  placeholder="Score"
                  min={1}
                  max={5}
                  value={kpi.score}
                  onChange={e => handleKpiChange(idx, 'score', Number(e.target.value))}
                  required
                />
                <button type="button" className="btn btn-xs btn-danger" onClick={() => removeKpi(idx)} disabled={kpis.length === 1}>Remove</button>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-xs btn-secondary mt-1" onClick={addKpi}>Add KPI</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">Period</label>
            <select value={period} onChange={e => setPeriod(e.target.value)} className="input w-full">
              <option value="term_1">Term 1</option>
              <option value="term_2">Term 2</option>
              <option value="term_3">Term 3</option>
              <option value="annual">Annual</option>
              <option value="probation">Probation</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Academic Year</label>
            <input type="text" value={academicYear} onChange={e => setAcademicYear(e.target.value)} className="input w-full" placeholder="2025/2026" required />
          </div>
          <div>
            <label className="block text-sm font-medium">Date</label>
            <input type="date" value={conductedDate} onChange={e => setConductedDate(e.target.value)} className="input w-full" required />
          </div>
          <div>
            <label className="block text-sm font-medium">Score (1-5)</label>
            <input type="number" min={1} max={5} step={0.1} value={overallScore} onChange={e => setOverallScore(Number(e.target.value))} className="input w-full" required />
          </div>
          <div>
            <label className="block text-sm font-medium">Rating</label>
            <select value={overallRating} onChange={e => setOverallRating(e.target.value)} className="input w-full">
              <option value="Excellent">Excellent</option>
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
              <option value="Poor">Poor</option>
            </select>
          </div>
          <div className="flex items-center gap-2 mt-2 md:mt-0">
            <input type="checkbox" checked={isEligibleForPromotion} onChange={e => setIsEligibleForPromotion(e.target.checked)} id="eligible" />
            <label htmlFor="eligible" className="text-sm font-medium">Eligible for Promotion</label>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">Supervisor Comments</label>
          <textarea value={supervisorComments} onChange={e => setSupervisorComments(e.target.value)} className="input w-full" rows={2} />
        </div>
        <div>
          <label className="block text-sm font-medium">Staff Comments</label>
          <textarea value={employeeComments} onChange={e => setEmployeeComments(e.target.value)} className="input w-full" rows={2} />
        </div>
        <div>
          <label className="block text-sm font-medium">Upload Scanned Appraisal (PDF/Image)</label>
          <input type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} className="input w-full" />
        </div>
        <button type="submit" className="btn btn-primary w-full">Save Appraisal</button>
      </form>
    </div>
  );
};

export default AppraisalForm;
