import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import db from '../db';

export interface JWTPayload {
  userId: string;
  roleSlug: string;
  permissions: string[];
  /** users.token_version at issue time – a mismatch means the session was revoked. */
  tv?: number;
  typ?: 'access' | 'refresh';
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

/** The live, database-backed view of a user that every request is checked against. */
export interface UserAuthState {
  userId: string;
  username: string;
  email: string;
  employeeId: string | null;
  roleId: string;
  roleSlug: string;
  roleName: string;
  permissions: string[];
  tokenVersion: number;
  mustChangePassword: boolean;
}

/**
 * Load a user's current role, permissions and session version straight from
 * the database. Returns null when the account is gone or deactivated.
 */
export async function loadUserAuthState(userId: string): Promise<UserAuthState | null> {
  const user = await db('users')
    .join('roles', 'users.role_id', 'roles.id')
    .where('users.id', userId)
    .andWhere('users.is_active', true)
    .select(
      'users.id', 'users.username', 'users.email', 'users.employee_id',
      'users.token_version', 'users.must_change_password',
      'roles.id as role_id', 'roles.slug as role_slug', 'roles.name as role_name'
    )
    .first();
  if (!user) return null;

  const permRows = await db('role_permissions')
    .join('permissions', 'role_permissions.permission_id', 'permissions.id')
    .where('role_permissions.role_id', user.role_id)
    .select(db.raw("concat(permissions.module_key, ':', permissions.action) as perm"));

  return {
    userId: user.id,
    username: user.username,
    email: user.email,
    employeeId: user.employee_id,
    roleId: user.role_id,
    roleSlug: user.role_slug,
    roleName: user.role_name,
    permissions: permRows.map((p: { perm: string }) => p.perm),
    tokenVersion: user.token_version ?? 0,
    mustChangePassword: !!user.must_change_password,
  };
}

// ── Short-lived per-process cache ────────────────────────────────────────────
// Avoids two queries on every request while bounding how long a revoked session
// or changed role can linger. Writes in this process invalidate immediately;
// other instances (if horizontally scaled) catch up within the TTL.
const CACHE_TTL_MS = 15_000;
const stateCache = new Map<string, { at: number; state: UserAuthState | null }>();

async function getAuthState(userId: string): Promise<UserAuthState | null> {
  const hit = stateCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.state;
  const state = await loadUserAuthState(userId);
  stateCache.set(userId, { at: Date.now(), state });
  if (stateCache.size > 5000) stateCache.clear();
  return state;
}

/** Call after changing anything that affects a user's sessions or permissions. */
export function invalidateUserAuthCache(userId?: string): void {
  if (userId) stateCache.delete(userId);
  else stateCache.clear();
}

/** Bump token_version, revoking every outstanding access and refresh token for the user. */
export async function revokeUserSessions(userId: string, trx = db): Promise<void> {
  await trx('users').where('id', userId).increment('token_version', 1);
  invalidateUserAuthCache(userId);
}

/** Routes a user with must_change_password may still reach. */
function allowedDuringForcedPasswordChange(req: Request): boolean {
  const url = req.originalUrl.split('?')[0];
  return url === '/api/auth/me' || url === '/api/auth/change-password' || url === '/api/auth/logout';
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }

  let payload: JWTPayload;
  try {
    payload = jwt.verify(authHeader.slice(7), config.jwt.secret, { algorithms: ['HS256'] }) as JWTPayload;
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
    return;
  }
  if (payload.typ && payload.typ !== 'access') {
    res.status(401).json({ message: 'Invalid or expired token' });
    return;
  }

  try {
    const state = await getAuthState(payload.userId);
    if (!state) {
      res.status(401).json({ message: 'Account is no longer active' });
      return;
    }
    // Tokens issued before token_version existed carry no `tv` and match version 0.
    if ((payload.tv ?? 0) !== state.tokenVersion) {
      res.status(401).json({ message: 'Session has been revoked. Please sign in again.' });
      return;
    }
    if (state.mustChangePassword && !allowedDuringForcedPasswordChange(req)) {
      res.status(403).json({ message: 'You must change your password before continuing.', code: 'PASSWORD_CHANGE_REQUIRED' });
      return;
    }

    // Authorise from the live role, not the (possibly stale) list inside the token.
    req.user = { userId: state.userId, roleSlug: state.roleSlug, permissions: state.permissions, tv: state.tokenVersion };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Factory: require a specific permission to proceed.
 * e.g. requirePermission('staff_profiles', 'create')
 * super_admin bypasses all permission checks.
 */
export function requirePermission(module: string, action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthenticated' });
      return;
    }
    // super_admin has access to everything
    if (req.user.roleSlug === 'super_admin') {
      next();
      return;
    }
    const needed = `${module}:${action}`;
    if (!req.user.permissions.includes(needed)) {
      res.status(403).json({ message: `Forbidden – requires ${needed}` });
      return;
    }
    next();
  };
}

/** True when the user holds the permission (super_admin holds all). */
export function hasPermission(user: JWTPayload | undefined, perm: string): boolean {
  if (!user) return false;
  return user.roleSlug === 'super_admin' || user.permissions.includes(perm);
}

/** Like requirePermission, but passes if the user holds any one of the listed permissions. */
export function requireAnyPermission(...perms: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthenticated' });
      return;
    }
    if (perms.some((p) => hasPermission(req.user, p))) {
      next();
      return;
    }
    res.status(403).json({ message: `Forbidden – requires one of ${perms.join(', ')}` });
  };
}
