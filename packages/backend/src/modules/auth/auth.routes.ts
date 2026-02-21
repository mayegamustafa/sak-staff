import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import db from '../../db';
import { config } from '../../config';
import { AppError } from '../../middleware/errorHandler';
import { authenticate, JWTPayload } from '../../middleware/auth';

const router = Router();

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function signAccess(payload: JWTPayload): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as any });
}

function signRefresh(payload: JWTPayload): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn as any });
}

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = LoginSchema.parse(req.body);

    const user = await db('users')
      .join('roles', 'users.role_id', 'roles.id')
      .where('users.username', username)
      .andWhere('users.is_active', true)
      .select(
        'users.id',
        'users.username',
        'users.email',
        'users.password_hash',
        'users.employee_id',
        'roles.slug as role_slug',
        'roles.name as role_name',
        'roles.id as role_id'
      )
      .first();

    if (!user) throw new AppError(401, 'Invalid credentials');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new AppError(401, 'Invalid credentials');

    // Fetch permissions for this role
    const permRows = await db('role_permissions')
      .join('permissions', 'role_permissions.permission_id', 'permissions.id')
      .where('role_permissions.role_id', user.role_id)
      .select(db.raw("concat(permissions.module_key, ':', permissions.action) as perm"));

    const permissions: string[] = permRows.map((p: { perm: string }) => p.perm);

    // Update last login
    await db('users').where('id', user.id).update({ last_login_at: new Date() });

    const payload: JWTPayload = { userId: user.id, roleSlug: user.role_slug, permissions };
    const accessToken = signAccess(payload);
    const refreshToken = signRefresh(payload);

    res.json({
      accessToken,
      refreshToken,
      expiresIn: 8 * 60 * 60,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        employeeId: user.employee_id,
        role: { id: user.role_id, slug: user.role_slug, name: user.role_name },
        permissions,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
    const payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as JWTPayload;
    const accessToken = signAccess(payload);
    res.json({ accessToken });
  } catch {
    next(new AppError(401, 'Invalid refresh token'));
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await db('users')
      .join('roles', 'users.role_id', 'roles.id')
      .where('users.id', req.user!.userId)
      .select('users.id', 'users.username', 'users.email', 'users.employee_id',
              'roles.id as role_id', 'roles.slug as role_slug', 'roles.name as role_name')
      .first();
    if (!user) throw new AppError(404, 'User not found');
    res.json({ ...user, permissions: req.user!.permissions });
  } catch (err) {
    next(err);
  }
});

export default router;
