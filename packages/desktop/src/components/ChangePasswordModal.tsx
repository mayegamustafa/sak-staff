import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { apiChangePassword } from '../lib/api';

interface Props {
  /** Forced mode: the server requires a new password, so the dialog cannot be dismissed. */
  forced?: boolean;
  onDone: () => void;
  onCancel?: () => void;
  onSignOut?: () => void;
}

/** Mirrors the server rule in packages/backend/src/utils/password.ts. */
function localProblem(pw: string): string | null {
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Include at least one letter and one number.';
  return null;
}

export default function ChangePasswordModal({ forced, onDone, onCancel, onSignOut }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const problem = localProblem(next);
    if (problem) return setError(problem);
    if (next !== confirm) return setError('The new passwords do not match.');
    setSaving(true);
    try {
      const result = await apiChangePassword(current, next);
      if (!result.success) return setError(result.message ?? 'Could not change password');
      onDone();
    } catch {
      setError('Unable to connect. Check your network.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <KeyRound size={18} className="text-brand-500" />
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">
            {forced ? 'Set a new password' : 'Change password'}
          </h2>
        </div>
        <form className="p-5 space-y-4" onSubmit={submit}>
          {forced && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Your password was set by an administrator or is a default. Choose your own password to continue.
            </p>
          )}
          <div>
            <label className="label">Current password</label>
            <input className="input" type="password" autoComplete="current-password" required
              value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div>
            <label className="label">New password</label>
            <input className="input" type="password" autoComplete="new-password" required
              value={next} onChange={(e) => setNext(e.target.value)}
              placeholder="At least 10 characters, a letter and a number" />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input className="input" type="password" autoComplete="new-password" required
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <p className="text-xs text-slate-400">You will be signed out on all other devices.</p>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            {forced
              ? onSignOut && <button type="button" className="btn-secondary" onClick={onSignOut}>Sign out</button>
              : onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>}
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
