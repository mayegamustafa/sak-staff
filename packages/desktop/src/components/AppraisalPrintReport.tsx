import { useQuery } from '@tanstack/react-query';

interface Props {
  appraisal: any;
  staffList: any[];
  onClose: () => void;
}

export default function AppraisalPrintReport({ appraisal, staffList, onClose }: Props) {
  const staff = staffList.find((s: any) => s.id === appraisal.employee_id);
  const staffName = staff ? `${staff.first_name} ${staff.last_name}` : appraisal.employee_name || '—';
  const staffNo = staff?.staff_no || appraisal.staff_no || '—';
  const campusName = appraisal.campus_name || staff?.campus_name || '—';
  const classNames = appraisal.class_names || staff?.class_names || null;
  const subjects = appraisal.subjects_of_preference || staff?.subjects_of_preference || staff?.subjects || null;

  // Template categories
  const template = appraisal.template;
  const categories: any[] = template?.categories || [];
  const terms: any[] = appraisal.terms || [];

  // Build a lookup: term → categoryId → score
  const scoreMap: Record<string, Record<string, number>> = {};
  for (const t of terms) {
    scoreMap[t.term] = {};
    for (const sc of (t.scores || [])) {
      scoreMap[t.term][sc.category_id] = Number(sc.score);
    }
  }

  // Find previous year appraisal (passed as prop or null)
  const prevYear = appraisal._prevYear;

  // Attendance data for this staff member and year
  const { data: attendanceRecords = [] } = useQuery({
    queryKey: ['attendance-records-report', appraisal.employee_id, appraisal.year],
    queryFn: () => window.sakAPI.attendance.listRecords({ staffId: appraisal.employee_id, year: appraisal.year }),
    enabled: !!appraisal.employee_id && !!appraisal.year,
  });
  const attRecords = attendanceRecords as { year: number; term: string; expected_days: number; days_present: number; days_absent: number; attendance_percentage: number; rating: string }[];
  const attAvg = attRecords.length > 0
    ? attRecords.reduce((s, r) => s + Number(r.attendance_percentage), 0) / attRecords.length
    : null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-2">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto relative print:shadow-none print:max-h-none print:overflow-visible print:p-0 print:rounded-none" id="appraisal-print-area"
        style={{ color: '#1a202c' }}>
        <button type="button" className="absolute top-2 right-2 text-xl no-print" onClick={onClose}>&times;</button>

        {/* ── Header ────────────────────────────── */}
        <div className="text-center border-b-2 border-gray-800 pb-4 mb-4">
          <div className="flex items-center justify-center gap-4 mb-2">
            <img src="/sak.jpg" alt="SAK" className="w-14 h-14 object-cover rounded" onError={e => (e.currentTarget.style.display = 'none')} />
            <div>
              <p className="text-lg font-extrabold uppercase tracking-wide">Sir Apollo Kaggwa Schools</p>
              <p className="text-xs text-gray-500 uppercase tracking-widest">Since 1996</p>
              <p className="text-xs text-gray-400">P.O. Box 7513, Kampala – Uganda</p>
              <p className="text-xs italic text-gray-400">&ldquo;Where your child is guaranteed a First grade&rdquo;</p>
            </div>
          </div>
          <h1 className="text-base font-bold uppercase tracking-wider mt-2" style={{ color: '#2563eb' }}>
            Annual Approved Appraisal Results
          </h1>
        </div>

        {/* ── A. Personal Information ───────────── */}
        <div className="mb-4">
          <h2 className="text-sm font-bold uppercase border-b border-gray-300 pb-1 mb-2">A. Personal Information</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
            <div><span className="font-semibold">Teacher Name:</span> {staffName}</div>
            <div><span className="font-semibold">Staff Code:</span> {staffNo}</div>
            <div><span className="font-semibold">Station:</span> {campusName}</div>
            <div><span className="font-semibold">Year:</span> {appraisal.year}</div>
            {classNames && <div><span className="font-semibold">Class/Stream:</span> {classNames}</div>}
            {subjects && <div><span className="font-semibold">Subject(s):</span> {subjects}</div>}
          </div>
        </div>

        {/* ── B. Actual Results ─────────────────── */}
        <div className="mb-4">
          <h2 className="text-sm font-bold uppercase border-b border-gray-300 pb-1 mb-2">B. Actual Results</h2>
          <table className="w-full text-xs border border-gray-300" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-1.5 text-left">Term</th>
                {categories.map((c: any) => (
                  <th key={c.id} className="border border-gray-300 px-2 py-1.5 text-center">{c.name}<br /><span className="font-normal text-gray-500">(/{c.max_score})</span></th>
                ))}
                <th className="border border-gray-300 px-2 py-1.5 text-center">Total %</th>
                <th className="border border-gray-300 px-2 py-1.5 text-center">Ranking</th>
                <th className="border border-gray-300 px-2 py-1.5 text-center">Category</th>
              </tr>
            </thead>
            <tbody>
              {['I', 'II', 'III'].map(term => {
                const t = terms.find((x: any) => x.term === term);
                return (
                  <tr key={term}>
                    <td className="border border-gray-300 px-2 py-1.5 font-medium">Term {term}</td>
                    {categories.map((c: any) => (
                      <td key={c.id} className="border border-gray-300 px-2 py-1.5 text-center">
                        {scoreMap[term]?.[c.id] !== undefined ? scoreMap[term][c.id] : '—'}
                      </td>
                    ))}
                    <td className="border border-gray-300 px-2 py-1.5 text-center font-bold" style={{ color: '#2563eb' }}>
                      {t?.term_score !== null && t?.term_score !== undefined ? `${Number(t.term_score).toFixed(1)}%` : '—'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center">
                      {t?.ranking || '—'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center">
                      {t?.category_label || '—'}
                    </td>
                  </tr>
                );
              })}
              {/* Annual Average row */}
              <tr className="font-bold bg-gray-50">
                <td className="border border-gray-300 px-2 py-1.5" colSpan={categories.length + 1}>
                  Annual Average Performance ({appraisal.year})
                </td>
                <td className="border border-gray-300 px-2 py-1.5 text-center" style={{ color: '#2563eb' }}>
                  {appraisal.annual_average !== null ? `${Number(appraisal.annual_average).toFixed(1)}%` : '—'}
                </td>
                <td className="border border-gray-300 px-2 py-1.5 text-center">—</td>
                <td className="border border-gray-300 px-2 py-1.5 text-center">
                  {appraisal.category_label || '—'}
                </td>
              </tr>
              {/* Previous year comparison */}
              {prevYear && (
                <tr className="bg-gray-50 text-gray-600">
                  <td className="border border-gray-300 px-2 py-1.5" colSpan={categories.length + 1}>
                    Previous Year ({prevYear.year})
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center">
                    {prevYear.annual_average !== null ? `${Number(prevYear.annual_average).toFixed(1)}%` : '—'}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center">—</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center">
                    {prevYear.category_label || '—'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── E. Attendance Summary ──────────────── */}
        <div className="mb-4">
          <h2 className="text-sm font-bold uppercase border-b border-gray-300 pb-1 mb-2">E. Staff Attendance Summary ({appraisal.year})</h2>
          {attRecords.length > 0 ? (
            <>
              <table className="w-full text-xs border-collapse mb-2">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-2 py-1 text-left">Term</th>
                    <th className="border border-gray-300 px-2 py-1 text-center">Expected Days</th>
                    <th className="border border-gray-300 px-2 py-1 text-center">Days Present</th>
                    <th className="border border-gray-300 px-2 py-1 text-center">Days Absent</th>
                    <th className="border border-gray-300 px-2 py-1 text-center">Attendance %</th>
                    <th className="border border-gray-300 px-2 py-1 text-center">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {attRecords.map((r, i) => (
                    <tr key={i}>
                      <td className="border border-gray-300 px-2 py-1">Term {r.term}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center">{r.expected_days}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center">{r.days_present}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center">{r.days_absent}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center">{Number(r.attendance_percentage).toFixed(1)}%</td>
                      <td className="border border-gray-300 px-2 py-1 text-center font-medium">{r.rating}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {attAvg !== null && (
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">Annual Attendance Average:</span> {attAvg.toFixed(1)}% —{' '}
                  <span className="font-semibold">{attAvg >= 95 ? 'EXCELLENT' : attAvg >= 85 ? 'GOOD' : attAvg >= 70 ? 'FAIR' : 'POOR'}</span>
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-400 italic">No attendance records for this year.</p>
          )}
        </div>

        {/* ── C. Guidance Section ──────────────── */}
        <div className="mb-4">
          <h2 className="text-sm font-bold uppercase border-b border-gray-300 pb-1 mb-2">C. Guidance, Supporting & Assistance</h2>
          <div className="text-sm min-h-[40px] border border-gray-200 rounded p-2 bg-gray-50">
            {appraisal.guidance_comment || <span className="text-gray-400 italic">None</span>}
          </div>
        </div>

        {/* ── D. Other Observations ────────────── */}
        <div className="mb-4">
          <h2 className="text-sm font-bold uppercase border-b border-gray-300 pb-1 mb-2">D. Other Observations</h2>
          <div className="text-sm min-h-[40px] border border-gray-200 rounded p-2 bg-gray-50">
            {appraisal.other_observations || <span className="text-gray-400 italic">None</span>}
          </div>
        </div>

        {/* ── Footer: Signatures ───────────────── */}
        <div className="grid grid-cols-3 gap-4 mt-8 text-sm border-t border-gray-300 pt-4">
          <div>
            <p className="font-semibold mb-6">Prepared By:</p>
            <div className="border-b border-gray-400 mb-1"></div>
            <p className="text-xs text-gray-500">{appraisal.prepared_by || 'Name & Signature'}</p>
          </div>
          <div>
            <p className="font-semibold mb-6">Approved By:</p>
            <div className="border-b border-gray-400 mb-1"></div>
            <p className="text-xs text-gray-500">{appraisal.approved_by || 'Name & Signature'}</p>
          </div>
          <div>
            <p className="font-semibold mb-6">Teacher Acknowledgement:</p>
            <div className="border-b border-gray-400 mb-1"></div>
            <p className="text-xs text-gray-500">Name & Signature</p>
          </div>
        </div>

        {/* ── Generated footer ─────────────────── */}
        <div className="mt-6 border-t pt-2 text-xs text-gray-400 flex justify-between">
          <span>Generated by SAK Staffing</span>
          <span>Printed: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
        </div>

        {/* Print button */}
        <div className="no-print text-center mt-4">
          <button className="btn btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>
    </div>
  );
}
