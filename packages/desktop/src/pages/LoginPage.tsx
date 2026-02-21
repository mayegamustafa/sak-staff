import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import InstallBanner from '../components/InstallBanner';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await window.sakAPI.auth.login(username, password);
      if (result.success && result.user) {
        setUser(result.user, result.permissions ?? []);
        navigate('/dashboard');
      } else {
        setError(result.message || 'Login failed');
      }
    } catch {
      setError('Unable to connect. Check your network.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img src="/sak.jpg" alt="Sir Apollo Kaggwa Schools" className="w-20 h-20 rounded-2xl object-cover shadow-lg shadow-brand-900/50 ring-2 ring-brand-500/30" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Sir Apollo Kaggwa Schools</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Staff Profiling System</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="card space-y-4">
          <div>
            <label className="label">Username</label>
            <input
              type="text"
              className="input"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary w-full justify-center py-2.5"
            disabled={loading || !username || !password}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Signing in…
              </span>
            ) : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-slate-400 dark:text-slate-600 text-xs mt-6">
          © {new Date().getFullYear()} Sir Apollo Kaggwa Schools – Since 1996
        </p>
      </div>
    </div>
    <InstallBanner />
  </>
  );
}
