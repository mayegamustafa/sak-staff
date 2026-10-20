import { useState, useRef } from 'react';
import {
  FileSpreadsheet, Download, Upload, Eye, CheckCircle2,
  AlertTriangle, XCircle, ChevronRight, RotateCcw, Users
} from 'lucide-react';
import { apiBulkImportTemplate, apiBulkImportPreview, apiBulkImportConfirm } from '../lib/api';

interface ParsedRow {
  national_id: string;
  first_name: string;
  last_name: string;
  other_names: string | null;
  date_of_birth: string | null;
  gender: string | null;
  phone: string;
  email: string | null;
  campus_name: string | null;
  job_title: string | null;
  contract_type: string | null;
  start_date: string | null;
  education: unknown[];
  work_history: unknown[];
  referees: unknown[];
  [key: string]: unknown;
}

interface PreviewResult {
  valid: ParsedRow[];
  errors: { row: number; national_id?: string; message: string }[];
  total: number;
}

interface ImportResult {
  created: number;
  createdNames: string[];
  errors: { name: string; message: string }[];
}

type Step = 'download' | 'upload' | 'preview' | 'done';

export default function BulkImportPage() {
  const [step, setStep]               = useState<Step>('download');
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [importing, setImporting]     = useState(false);
  const [preview, setPreview]         = useState<PreviewResult | null>(null);
  const [result, setResult]           = useState<ImportResult | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const fileInputRef                  = useRef<HTMLInputElement>(null);

  // ── Step 1: Download template ─────────────────────────────────────────────
  const handleDownloadTemplate = async () => {
    setDownloading(true);
    setError(null);
    try {
      const arrayBuffer = await apiBulkImportTemplate();
      const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'sak-staff-import-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      setStep('upload');
    } catch (err) {
      setError(`Download failed: ${(err as Error).message}`);
    } finally {
      setDownloading(false);
    }
  };

  // ── Step 2: Upload & preview ──────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('Please upload an Excel file (.xlsx or .xls)');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result      = await apiBulkImportPreview(arrayBuffer);
      setPreview(result as PreviewResult);
      setStep('preview');
    } catch (err) {
      setError(`Failed to read file: ${(err as Error).message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Step 3: Confirm import ────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!preview || preview.valid.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await apiBulkImportConfirm(preview.valid);
      setResult(res as ImportResult);
      setStep('done');
    } catch (err) {
      setError(`Import failed: ${(err as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep('download');
    setPreview(null);
    setResult(null);
    setError(null);
  };

  // ── Step indicators ───────────────────────────────────────────────────────
  const steps = [
    { id: 'download', label: 'Download Template' },
    { id: 'upload',   label: 'Upload Filled File' },
    { id: 'preview',  label: 'Review & Confirm'  },
    { id: 'done',     label: 'Done'              },
  ];
  const stepIdx = steps.findIndex(s => s.id === step);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-blue-600" />
          Bulk Staff Import
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Import multiple staff records from an Excel file
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              i < stepIdx  ? 'text-green-700 bg-green-100' :
              i === stepIdx ? 'text-blue-700 bg-blue-100' :
                              'text-gray-400 bg-gray-100'
            }`}>
              {i < stepIdx ? <CheckCircle2 className="w-4 h-4" /> : <span className="w-4 h-4 flex items-center justify-center text-xs font-bold">{i + 1}</span>}
              {s.label}
            </div>
            {i < steps.length - 1 && <ChevronRight className="w-4 h-4 text-gray-300 mx-1" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 text-sm text-red-700">
          <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ── Step 1: Download ── */}
      {(step === 'download' || step === 'upload') && (
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="max-w-lg mx-auto space-y-8">
            {/* Download section */}
            <div className={`rounded-xl p-6 border-2 ${step === 'download' ? 'border-blue-500 bg-blue-50' : 'border-green-400 bg-green-50'}`}>
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${step === 'download' ? 'bg-blue-100' : 'bg-green-100'}`}>
                  {step === 'upload' ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  ) : (
                    <Download className="w-6 h-6 text-blue-600" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Step 1 — Download the Template</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Get the Excel template with the correct format. It has 4 sheets:
                    <strong> Staff</strong> (main details),  <strong>Education</strong>,
                    <strong> WorkHistory</strong>, and <strong>Referees</strong>.
                    Each sheet is keyed by <code className="bg-gray-100 px-1 rounded">national_id</code>.
                  </p>
                  <button
                    onClick={handleDownloadTemplate}
                    disabled={downloading}
                    className="mt-3 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    {downloading ? 'Downloading…' : 'Download Template (.xlsx)'}
                  </button>
                </div>
              </div>
            </div>

            {/* Upload section */}
            {step === 'upload' && (
              <div className="rounded-xl p-6 border-2 border-blue-500 bg-blue-50">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-blue-100">
                    <Upload className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">Step 2 — Upload Your Filled File</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      After filling in the template, save it and upload it here. The system will check for errors before importing.
                    </p>
                    <label className="mt-3 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium cursor-pointer w-fit">
                      <Upload className="w-4 h-4" />
                      {uploading ? 'Reading file…' : 'Upload & Preview'}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleFileChange}
                        className="hidden"
                        disabled={uploading}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Step 2: Preview ── */}
      {step === 'preview' && preview && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{preview.total}</p>
              <p className="text-xs text-gray-500 mt-0.5">Total Rows</p>
            </div>
            <div className="bg-white rounded-xl border border-green-200 bg-green-50 p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{preview.valid.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Ready to Import</p>
            </div>
            <div className={`rounded-xl border p-4 text-center ${preview.errors.length > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
              <p className={`text-2xl font-bold ${preview.errors.length > 0 ? 'text-red-700' : 'text-gray-400'}`}>{preview.errors.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Rows with Errors</p>
            </div>
          </div>

          {/* Errors */}
          {preview.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h3 className="font-semibold text-red-800 flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4" /> Rows That Cannot Be Imported
              </h3>
              <div className="space-y-1.5">
                {preview.errors.map((e, i) => (
                  <div key={i} className="text-sm text-red-700 flex gap-2">
                    <span className="text-red-400 font-medium flex-shrink-0">Row {e.row}:</span>
                    {e.national_id && <span className="text-red-500">{e.national_id} —</span>}
                    <span>{e.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Valid rows table */}
          {preview.valid.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Eye className="w-4 h-4" /> Preview — {preview.valid.length} staff will be imported
                </h3>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      {['National ID', 'Name', 'Phone', 'Gender', 'Campus', 'Job Title', 'Contract', 'Education', 'Work History', 'Referees'].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.valid.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs text-gray-600">{row.national_id}</td>
                        <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{row.first_name} {row.last_name}</td>
                        <td className="px-3 py-2 text-gray-600">{row.phone}</td>
                        <td className="px-3 py-2 text-gray-600">{row.gender || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.campus_name || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.job_title || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.contract_type || '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-500">{(row.education as unknown[]).length || '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-500">{(row.work_history as unknown[]).length || '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-500">{(row.referees as unknown[]).length || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
              <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
              <p className="text-yellow-800 font-medium">No valid rows found</p>
              <p className="text-sm text-yellow-600 mt-1">All rows have errors. Fix the issues and re-upload.</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={importing || preview.valid.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
            >
              <Users className="w-4 h-4" />
              {importing ? 'Importing…' : `Import ${preview.valid.length} Staff`}
            </button>
            <button
              onClick={reset}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 text-sm"
            >
              <RotateCcw className="w-4 h-4" /> Start Over
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Done ── */}
      {step === 'done' && result && (
        <div className="bg-white rounded-xl border border-gray-200 p-10">
          <div className="max-w-md mx-auto text-center space-y-5">
            {result.created > 0 ? (
              <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto" />
            ) : (
              <AlertTriangle className="w-14 h-14 text-yellow-500 mx-auto" />
            )}
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {result.created > 0 ? `${result.created} staff imported!` : 'Import complete with issues'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {result.created > 0 && `Successfully created ${result.created} employee record${result.created > 1 ? 's' : ''}.`}
                {result.errors.length > 0 && ` ${result.errors.length} record${result.errors.length > 1 ? 's' : ''} failed.`}
              </p>
            </div>

            {result.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left">
                <h4 className="text-sm font-semibold text-red-800 mb-2">Failed records:</h4>
                <div className="space-y-1">
                  {result.errors.map((e, i) => (
                    <div key={i} className="text-xs text-red-700">
                      <span className="font-medium">{e.name}:</span> {e.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={reset}
                className="flex items-center gap-2 px-5 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"
              >
                <RotateCcw className="w-4 h-4" /> Import More
              </button>
              <a
                href="/employees"
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                <Users className="w-4 h-4" /> View Staff List
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
