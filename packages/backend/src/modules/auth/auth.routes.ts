import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import db from '../../db';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { passwordProblem } from '../../utils/password';
import { AppError } from '../../middleware/errorHandler';
import {
  authenticate, loadUserAuthState, revokeUserSessions, invalidateUserAuthCache,
  JWTPayload, UserAuthState,
} from '../../middleware/auth';

const router = Router();

const LoginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

/**
 * Password-spraying protection: failed logins per client IP across all
 * usernames. Per-account guessing is handled by the DB-backed lockout below,
 * which (unlike this in-memory limiter) survives restarts and multiple instances.
 */
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.rateLimit.loginIpMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: 'Too many failed login attempts from this network. Please try again in 15 minutes.' },
});

/** Light limiter for the other credential endpoints. */
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' },
});

// Compared against when the username doesn't exist, so response time doesn't
// reveal which usernames are valid.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', 12);

function signAccess(state: UserAuthState): string {
  const payload: JWTPayload = {
    userId: state.userId, roleSlug: state.roleSlug, permissions: state.permissions,
    tv: state.tokenVersion, typ: 'access',
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(payload, config.jwt.secret, { algorithm: 'HS256', expiresIn: config.jwt.expiresIn as any });
}

function signRefresh(state: UserAuthState): string {
  // The refresh token carries identity only; role and permissions are re-read on use.
  const payload = { userId: state.userId, tv: state.tokenVersion, typ: 'refresh' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(payload, config.jwt.refreshSecret, { algorithm: 'HS256', expiresIn: config.jwt.refreshExpiresIn as any });
}

function secondsUntilExpiry(token: string): number {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  return decoded?.exp ? Math.max(0, decoded.exp - Math.floor(Date.now() / 1000)) : 0;
}

function sessionResponse(state: UserAuthState) {
  const accessToken = signAccess(state);
  return {
    accessToken,
    refreshToken: signRefresh(state),
    expiresIn: secondsUntilExpiry(accessToken),
    mustChangePassword: state.mustChangePassword,
    user: {
      id: state.userId,
      username: state.username,
      email: state.email,
      employeeId: state.employeeId,
      role: { id: state.roleId, slug: state.roleSlug, name: state.roleName },
      permissions: state.permissions,
      mustChangePassword: state.mustChangePassword,
    },
  };
}

// POST /api/auth/login
router.post('/login', loginIpLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = LoginSchema.parse(req.body);

    const user = await db('users')
      .where('username', username)
      .andWhere('is_active', true)
      .select('id', 'password_hash', 'failed_login_count', 'locked_until')
      .first();

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      logger.warn(`Failed login for unknown/inactive user "${username}" from ${req.ip}`);
      throw new AppError(401, 'Invalid credentials');
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      logger.warn(`Login attempt on locked account "${username}" from ${req.ip}`);
      throw new AppError(429, 'This account is temporarily locked after too many failed attempts. Try again later or ask an administrator to reset it.');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const failures = (user.failed_login_count ?? 0) + 1;
      const lock = failures >= config.rateLimit.loginMax;
      await db('users').where('id', user.id).update({
        failed_login_count: lock ? 0 : failures,
        locked_until: lock ? new Date(Date.now() + config.rateLimit.loginLockMinutes * 60_000) : user.locked_until,
      });
      logger.warn(`Failed login for user "${username}" from ${req.ip}${lock ? ' – account locked' : ''}`);
      throw new AppError(401, 'Invalid credentials');
    }

    await db('users').where('id', user.id).update({
      last_login_at: new Date(), failed_login_count: 0, locked_until: null,
    });

    const state = await loadUserAuthState(user.id);
    if (!state) throw new AppError(401, 'Invalid credentials');
    logger.info(`User "${username}" signed in from ${req.ip}`);
    res.json(sessionResponse(state));
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
//
// Role and permissions are re-read from the database, and the token version is
// checked, so deactivation, role changes and password changes take effect here.
// A fresh refresh token is returned too; clients should replace the old one.
router.post('/refresh', credentialLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string().min(1) }).parse(req.body);

    let payload: { userId: string; tv?: number; typ?: string };
    try {
      payload = jwt.verify(refreshToken, config.jwt.refreshSecret, { algorithms: ['HS256'] }) as typeof payload;
    } catch {
      throw new AppError(401, 'Invalid refresh token');
    }
    if (payload.typ && payload.typ !== 'refresh') throw new AppError(401, 'Invalid refresh token');

    const state = await loadUserAuthState(payload.userId);
    if (!state) throw new AppError(401, 'Account is no longer active');
    if ((payload.tv ?? 0) !== state.tokenVersion) throw new AppError(401, 'Session has been revoked. Please sign in again.');

    const session = sessionResponse(state);
    res.json({
      ...session,
      // Kept for older clients that read these at the top level.
      permissions: state.permissions,
      role: session.user.role,
    });
  } catch (err) {
    next(err instanceof AppError ? err : new AppError(401, 'Invalid refresh token'));
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await loadUserAuthState(req.user!.userId);
    if (!state) throw new AppError(404, 'User not found');
    res.json({
      id: state.userId,
      username: state.username,
      email: state.email,
      employee_id: state.employeeId,
      role_id: state.roleId,
      role_slug: state.roleSlug,
      role_name: state.roleName,
      permissions: state.permissions,
      mustChangePassword: state.mustChangePassword,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout   { everywhere?: boolean }
//
// Tokens are stateless, so a plain logout is the client discarding them.
// `everywhere: true` revokes every session for this account on every device.
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { everywhere } = z.object({ everywhere: z.boolean().optional() }).parse(req.body ?? {});
    if (everywhere) {
      await revokeUserSessions(req.user!.userId);
      logger.info(`User ${req.user!.userId} signed out of all sessions`);
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password   { currentPassword, newPassword }
//
// Revokes all other sessions and returns a fresh token pair for this one.
router.post('/change-password', credentialLimiter, authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string().min(1).max(200),
      newPassword: z.string().min(1).max(200),
    }).parse(req.body);

    const user = await db('users').where('id', req.user!.userId).select('id', 'username', 'password_hash').first();
    if (!user) throw new AppError(404, 'User not found');

    if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
      logger.warn(`Failed password change for "${user.username}" from ${req.ip}`);
      throw new AppError(400, 'Current password is incorrect');
    }
    const problem = passwordProblem(newPassword, user.username);
    if (problem) throw new AppError(422, problem);
    if (await bcrypt.compare(newPassword, user.password_hash)) {
      throw new AppError(422, 'New password must be different from the current one.');
    }

    await db('users').where('id', user.id).update({
      password_hash: await bcrypt.hash(newPassword, 12),
      password_changed_at: new Date(),
      must_change_password: false,
      token_version: db.raw('token_version + 1'),
      updated_at: new Date(),
    });
    invalidateUserAuthCache(user.id);
    logger.info(`User "${user.username}" changed their password`);

    const state = await loadUserAuthState(user.id);
    if (!state) throw new AppError(401, 'Account is no longer active');
    res.json(sessionResponse(state));
  } catch (err) {
    next(err);
  }
});

export default router;
