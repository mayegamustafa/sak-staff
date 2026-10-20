import { useState, useEffect, useCallback } from 'react';
import { Link2, PlusCircle, Copy, Trash2, CheckCircle2, RefreshCw, Share2, ExternalLink } from 'lucide-react';
import {
  apiOnboardingGenerateLink,
  apiOnboardingListTokens,
  apiOnboardingRevokeToken,
  apiOnboardingDeleteToken,
  apiServerInfo,
  apiGetCampuses,
} from '../lib/api';

interface OnboardingToken {
  id: string;
  token: string;
  short_code?: string | null;
  campus_id: string | null;
  campus_name: string | null;
  recipient_name: string | null;
  submission_count: number;
  is_revoked: boolean;
  expires_at?: string;
  created_at: string;
}

interface Campus { id: string; name: string; is_active: boolean }
interface ServerInfo { ip: string; port: number; baseUrl: string }

export default function OnboardingLinksPage() {
  const [tokens, setTokens]         = useState<OnboardingToken[]>([]);
  const [campuses, setCampuses]     = useState<Campus[]>([]);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [form, setForm]             = useState({ campusId: '', label: '' });
  const [generating, setGenerating] = useState(false);
  const [newLink, setNewLink]       = useState<string | null>(null);
  const [newCampusName, setNewCampusName] = useState<string>('');
  const [copied, setCopied]         = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  // Load campuses once on mount — separate from token refresh so one failure
  // doesn't starve the other.
  useEffect(() => {
    apiGetCampuses()
      .then((list) => setCampuses(list.filter(c => c.is_active !== false)))
      .catch(() => { /* show empty dropdown if campuses fail */ });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [toks, si] = await Promise.all([
        apiOnboardingListTokens(),
        apiServerInfo(),
      ]);
      setTokens(toks as OnboardingToken[]);
      setServerInfo(si);
    } catch {
      setError('Failed to load. Is the server running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const buildLink = (tok: OnboardingToken) =>
    serverInfo
      ? (tok.short_code
          ? `${serverInfo.baseUrl}/s/${tok.short_code}`
          : `${serverInfo.baseUrl}/onboarding/${tok.token}`)
      : `http://localhost/s/${tok.short_code ?? tok.token}`;

  const buildFullLink = (tok: OnboardingToken) =>
    serverInfo
      ? `${serverInfo.baseUrl}/onboarding/${tok.token}`
      : `http://localhost/onboarding/${tok.token}`;

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2500);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.campusId) return;
    setGenerating(true);
    setError(null);
    try {
      const tok = await apiOnboardingGenerateLink(
        form.campusId,
        form.label.trim() || undefined
      ) as OnboardingToken & { campus_name: string };
      const link = buildLink(tok);
      setNewLink(link);
      setNewCampusName(tok.campus_name || campuses.find(c => c.id === form.campusId)?.name || '');
      await load();
    } catch {
      setError('Failed to generate link. Is the server running?');
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (id: string, campusName: string | null) => {
    if (!confirm(`Revoke the onboarding link for ${campusName || 'this station'}? Staff will no longer be able to use it.`)) return;
    await apiOnboardingRevokeToken(id);
    load();
  };

  const handleDelete = async (id: string, campusName: string | null) => {
    if (!confirm(`Permanently delete the onboarding link for ${campusName || 'this station'}? This cannot be undone.`)) return;
    await apiOnboardingDeleteToken(id);
    load();
  };

  const statusBadge = (tok: OnboardingToken) => {
    if (tok.is_revoked) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-medium">Revoked</span>;
    const expired = tok.expires_at && new Date(tok.expires_at) < new Date();
    if (expired)        return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 font-medium">Expired</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">Active</span>;
  };

  const whatsappShareLink = (tok: OnboardingToken) => {
    const link = buildLink(tok);
    const campus = tok.campus_name || tok.recipient_name || 'your station';
    const expiresDate = tok.expires_at
      ? new Date(tok.expires_at).toLocaleDateString('en-UG', { day: 'numeric', month: 'long', year: 'numeric' })
      : '7 days';
    const msg = encodeURIComponent(
      `Dear Staff,\n\nPlease use the link below to submit your registration for *${campus}*:\n\n${link}\n\nThis link is valid until ${expiresDate} and can be used by all staff at your station.\n\n— SAK Schools HR`
    );
    return `https://wa.me/?text=${msg}`;
  };

  const isActive = (tok: OnboardingToken) =>
    !tok.is_revoked && !(tok.expires_at && new Date(tok.expires_at) < new Date());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Link2 className="w-6 h-6 text-blue-600" />
            Station Onboarding Links
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate a link for each campus/station — valid 7 days, any number of staff can submit
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
            title="Refresh"
          ><RefreshCw className="w-4 h-4" /></button>
          <button
            onClick={() => { setShowModal(true); setNewLink(null); setForm({ campusId: '', label: '' }); setError(null); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <PlusCircle className="w-4 h-4" /> New Station Link
          </button>
        </div>
      </div>

      {/* Server info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2 text-sm text-blue-800">
        <Link2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          Links point to <strong>{serverInfo?.baseUrl ?? 'http://localhost'}</strong>.{' '}
          Staff open the short link on any device. Short links like <code className="bg-blue-100 px-1 rounded text-xs">/s/AbC12345</code> are fully clickable on WhatsApp.
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Loading…</div>
        ) : tokens.length === 0 ? (
          <div className="p-12 text-center">
            <Link2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No station links yet. Generate one for each campus to share with incoming staff.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Station / Campus</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Link</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Submissions</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Expires</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tokens.map(tok => {
                  const active = isActive(tok);
                  const link       = buildLink(tok);
                  const fullLink   = buildFullLink(tok);
                  return (
                    <tr key={tok.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{tok.campus_name || tok.recipient_name || <span className="text-gray-400 italic">—</span>}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Created {new Date(tok.created_at).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-[260px]">
                        {active ? (
                          <div className="space-y-1">
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              title="Short link — best for WhatsApp sharing"
                              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 underline underline-offset-2 text-sm font-medium"
                            >
                              <ExternalLink className="w-3 h-3 flex-shrink-0" />
                              {link}
                            </a>
                            <div className="text-xs text-gray-400 font-mono break-all">{fullLink}</div>
                          </div>
                        ) : (
                          <span className="text-xs font-mono text-gray-400 break-all">{fullLink}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 font-bold text-sm">
                          {tok.submission_count ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {tok.expires_at
                          ? new Date(tok.expires_at).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3">{statusBadge(tok)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {active && (
                            <>
                              <button
                                onClick={() => copyToClipboard(link, tok.id)}
                                title="Copy link"
                                className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                              >
                                {copied === tok.id
                                  ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  : <Copy className="w-4 h-4" />}
                              </button>
                              <a
                                href={whatsappShareLink(tok)}
                                target="_blank"
                                rel="noreferrer"
                                title="Share via WhatsApp"
                                className="p-1.5 rounded hover:bg-gray-100 text-green-600"
                              >
                                <Share2 className="w-4 h-4" />
                              </a>
                              <button
                                onClick={() => handleRevoke(tok.id, tok.campus_name)}
                                title="Revoke link"
                                className="p-1.5 rounded hover:bg-red-50 text-red-400"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {!active && (
                            <button
                              onClick={() => handleDelete(tok.id, tok.campus_name)}
                              title="Delete permanently"
                              className="p-1.5 rounded hover:bg-red-50 text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate Link Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">New Station Onboarding Link</h2>
            <p className="text-sm text-gray-500 mb-5">
              Choose the campus/station. Any number of staff at that station can submit through this link.
              It will be valid for <strong>7 days</strong>.
            </p>

            {newLink ? (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <p className="text-xs text-green-700 font-semibold mb-2">✓ Link generated for {newCampusName}</p>
                  <a
                    href={newLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-1.5 text-blue-700 hover:text-blue-900 underline underline-offset-2 text-xs font-mono break-all"
                  >
                    <ExternalLink className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    {newLink}
                  </a>
                  <p className="text-xs text-gray-500 mt-2">
                    Share this link with staff at <strong>{newCampusName}</strong> via WhatsApp group, SMS, or printed notice.
                    Works on any phone on the same network.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyToClipboard(newLink, 'modal')}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    {copied === 'modal' ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied === 'modal' ? 'Copied!' : 'Copy Link'}
                  </button>
                  <button
                    onClick={() => { setShowModal(false); setNewLink(null); }}
                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                  >Done</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleGenerate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Campus / Station <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.campusId}
                    onChange={e => setForm(p => ({ ...p, campusId: e.target.value }))}
                    required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">— Select campus —</option>
                    {campuses.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Label / Batch Note <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. January 2026 intake"
                    value={form.label}
                    onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={generating || !form.campusId}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                  >{generating ? 'Generating…' : 'Generate Link'}</button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
                  >Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
