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

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:4000';

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
  const { user, accessToken, permissions } = data;
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
    // browser-mode extras
    _user: user,
  };
}

export async function apiLogout() {
  if (isElectron()) {
    return window.sakAPI.auth.logout();
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
