/**
 * Detect whether the app is running inside Electron.
 * When opened directly in a browser (e.g. http://localhost:5173),
 * window.sakAPI is undefined because the preload script hasn't run.
 */
export const isElectron = (): boolean =>
  typeof window !== 'undefined' && typeof window.sakAPI !== 'undefined';

// ── Browser-mode storage keys ─────────────────────────────────────────────────
const TOKEN_KEY = 'sak_token';
const USER_KEY = 'sak_user';
const PERMS_KEY = 'sak_permissions';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string) || '';

// ── Unified auth helpers ──────────────────────────────────────────────────────

export async function apiLogin(username: string, password: string) {
  if (isElectron()) {
    return window.sakAPI.auth.login(username, password);
  }
  // Browser: call REST API directly
  const res = await fetch(`${SERVER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) return { success: false, message: data.message ?? 'Login failed' };
  const { user, accessToken, permissions, mustChangePassword } = data;
  // Persist to localStorage for session restore
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(PERMS_KEY, JSON.stringify(permissions ?? user.permissions ?? []));
  return {
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email ?? '',
      role: user.role,
    },
    permissions: permissions ?? user.permissions ?? [],
    mustChangePassword: !!(mustChangePassword ?? user.mustChangePassword),
  };
}

export async function apiGetSession() {
  if (isElectron()) {
    return window.sakAPI.auth.getSession();
  }
  // Browser: restore from localStorage
  const token = localStorage.getItem(TOKEN_KEY);
  const userStr = localStorage.getItem(USER_KEY);
  const permsStr = localStorage.getItem(PERMS_KEY);
  if (!token || !userStr) return null;
  const user = JSON.parse(userStr);
  return {
    userId: user.id,
    username: user.username,
    roleSlug: user.role?.slug ?? '',
    permissions: permsStr ? JSON.parse(permsStr) : [],
    mustChangePassword: !!user.mustChangePassword,
    // browser-mode extras
    _user: user,
  };
}

/**
 * Change the signed-in user's password. The server revokes every other session
 * and returns a fresh token pair for this one, which replaces the stored token.
 */
export async function apiChangePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message?: string }> {
  if (isElectron()) {
    return window.sakAPI.auth.changePassword(currentPassword, newPassword);
  }
  const res = await fetch(`${SERVER_URL}/api/auth/change-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getBrowserToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false, message: data.message ?? 'Could not change password' };
  localStorage.setItem(TOKEN_KEY, data.accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  localStorage.setItem(PERMS_KEY, JSON.stringify(data.user?.permissions ?? []));
  return { success: true };
}

export async function apiLogout(everywhere = false) {
  if (isElectron()) {
    return window.sakAPI.auth.logout();
  }
  // Best effort: lets the server revoke all sessions when asked to.
  const token = getBrowserToken();
  if (token && everywhere) {
    await fetch(`${SERVER_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ everywhere }),
    }).catch(() => {});
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(PERMS_KEY);
}

export function apiSyncOnStatusChange(cb: (s: unknown) => void) {
  if (isElectron()) window.sakAPI.sync.onStatusChange(cb);
  // no-op in browser
}

export function apiSyncTrigger() {
  if (isElectron()) window.sakAPI.sync.trigger();
  // no-op in browser
}

export function getBrowserToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

// ── Bulk Import ───────────────────────────────────────────────────────────────

export async function apiBulkImportTemplate(): Promise<ArrayBuffer> {
  if (isElectron()) {
    const result = await window.sakAPI.employees.bulkImportTemplate() as { ok: boolean; data?: Uint8Array; status?: number; error?: string };
    if (!result.ok) {
      throw new Error(
        result.status === 401 ? 'Session expired — please log out and log back in' :
        result.status === 403 ? 'You do not have permission to download the template' :
        result.error ?? `Server error (${result.status})`
      );
    }
    const u8 = new Uint8Array(result.data!);
    return u8.buffer as ArrayBuffer;
  }
  const res = await fetch(`${SERVER_URL}/api/employees/bulk-import/template`, {
    headers: { Authorization: `Bearer ${getBrowserToken()}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Server returned ${res.status}${errText ? ': ' + errText : ''}`);
  }
  return res.arrayBuffer();
}

export async function apiBulkImportPreview(fileBuffer: ArrayBuffer): Promise<unknown> {
  if (isElectron()) {
    return window.sakAPI.employees.bulkImportPreview(fileBuffer);
  }
  const form = new FormData();
  form.append('file', new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'import.xlsx');
  const res = await fetch(`${SERVER_URL}/api/employees/bulk-import/preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getBrowserToken()}` },
    body: form,
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message ?? 'Preview failed'); }
  return res.json();
}

export async function apiBulkImportConfirm(rows: unknown[]): Promise<unknown> {
  if (isElectron()) {
    return window.sakAPI.employees.bulkImportConfirm(rows);
  }
  const res = await fetch(`${SERVER_URL}/api/employees/bulk-import/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getBrowserToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message ?? 'Import failed'); }
  return res.json();
}

// ── Onboarding admin ──────────────────────────────────────────────────────────

export async function apiOnboardingGenerateLink(campusId: string, label?: string): Promise<unknown> {
  if (isElectron()) {
    return window.sakAPI.onboarding.generateLink(campusId, label);
  }
  const res = await fetch(`${SERVER_URL}/api/onboarding/admin/generate-link`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getBrowserToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ campus_id: campusId, label }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? 'Failed to generate link'); }
  return res.json();
}

export async function apiOnboardingListTokens(): Promise<unknown[]> {
  if (isElectron()) {
    return window.sakAPI.onboarding.listTokens();
  }
  const res = await fetch(`${SERVER_URL}/api/onboarding/admin/tokens`, {
    headers: { Authorization: `Bearer ${getBrowserToken()}` },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function apiOnboardingRevokeToken(id: string): Promise<void> {
  if (isElectron()) {
    await window.sakAPI.onboarding.revokeToken(id);
    return;
  }
  await fetch(`${SERVER_URL}/api/onboarding/admin/tokens/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getBrowserToken()}` },
  });
}

export async function apiOnboardingDeleteToken(id: string): Promise<void> {
  if (isElectron()) {
    await window.sakAPI.onboarding.revokeToken(id);
    return;
  }
  await fetch(`${SERVER_URL}/api/onboarding/admin/tokens/${id}?permanent=true`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getBrowserToken()}` },
  });
}

export async function apiOnboardingPendingList(): Promise<unknown[]> {
  if (isElectron()) {
    // IPC not wired for this — fall through to browser fetch
  }
  const res = await fetch(`${SERVER_URL}/api/onboarding/admin/pending`, {
    headers: { Authorization: `Bearer ${getBrowserToken()}` },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function apiOnboardingGetPendingDetail(id: string): Promise<unknown> {
  const res = await fetch(`${SERVER_URL}/api/onboarding/admin/pending/${id}`, {
    headers: { Authorization: `Bearer ${getBrowserToken()}` },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Failed to load details'); }
  return res.json();
}

export async function apiOnboardingApprove(
  id: string,
  opts?: { job_title?: string; contract_type?: string; start_date?: string },
): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/onboarding/admin/${id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getBrowserToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(opts ?? {}),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Failed to approve'); }
}

export async function apiOnboardingReject(id: string, reason?: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/onboarding/admin/${id}/reject`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getBrowserToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'Failed to reject'); }
}

export async function apiServerInfo(): Promise<{ ip: string; port: number; baseUrl: string }> {
  if (isElectron()) {
    return window.sakAPI.serverInfo();
  }
  const res = await fetch(`${SERVER_URL}/api/server-info`);
  if (!res.ok) return { ip: 'localhost', port: 4000, baseUrl: SERVER_URL };
  return res.json();
}

export async function apiGetCampuses(): Promise<{ id: string; name: string; is_active: boolean }[]> {
  if (isElectron() && window.sakAPI.campuses?.list) {
    return (await window.sakAPI.campuses.list()) as { id: string; name: string; is_active: boolean }[];
  }
  const res = await fetch(`${SERVER_URL}/api/campuses`, {
    headers: { Authorization: `Bearer ${getBrowserToken()}` },
  });
  if (!res.ok) return [];
  return res.json();
}
