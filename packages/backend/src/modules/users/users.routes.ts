import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import db from '../../db';
import { authenticate, requirePermission, invalidateUserAuthCache } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { passwordProblem } from '../../utils/password';
import { logger } from '../../utils/logger';

const router = Router();
router.use(authenticate);
router.use(requirePermission('user_management', 'read'));

const CreateUserSchema = z.object({
  username: z.string().trim().min(3).max(100).regex(/^[A-Za-z0-9._@ -]+$/, 'Username contains invalid characters'),
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
  roleId: z.string().uuid(),
  employeeId: z.string().uuid().optional(),
  campusId: z.string().uuid().optional(),
});

/**
 * Only a super admin may create, modify or reset another super admin. Without
 * this, anyone granted user_management could take over the top account.
 */
async function assertCanManageRole(req: Request, roleId: string): Promise<void> {
  if (req.user!.roleSlug === 'super_admin') return;
  const role = await db('roles').where('id', roleId).select('slug').first();
  if (!role) throw new AppError(422, 'Unknown role');
  if (role.slug === 'super_admin') throw new AppError(403, 'Only a Super Admin can manage Super Admin accounts');
}

// GET /api/users
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await db('users')
      .join('roles', 'users.role_id', 'roles.id')
      .select('users.id', 'users.username', 'users.email', 'users.is_active',
              'users.last_login_at', 'users.created_at', 'users.locked_until',
              'users.must_change_password',
              'roles.name as role_name', 'roles.slug as role_slug');
    res.json(users);
  } catch (err) { next(err); }
});

// POST /api/users
router.post('/', requirePermission('user_management', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = CreateUserSchema.parse(req.body);
      await assertCanManageRole(req, data.roleId);
      const problem = passwordProblem(data.password, data.username);
      if (problem) throw new AppError(422, problem);

      const clash = await db('users')
        .whereRaw('lower(username) = lower(?)', [data.username])
        .orWhereRaw('lower(email) = lower(?)', [data.email])
        .first();
      if (clash) throw new AppError(409, 'A user with that username or email already exists');

      const hash = await bcrypt.hash(data.password, 12);
      const [user] = await db('users').insert({
        id: uuidv4(),
        username: data.username,
        email: data.email,
        password_hash: hash,
        role_id: data.roleId,
        employee_id: data.employeeId,
        campus_id: data.campusId,
        is_active: true,
        // The admin chose this password, so the user should replace it.
        must_change_password: true,
      }).returning(['id', 'username', 'email', 'role_id', 'is_active', 'created_at']);
      logger.info(`User "${data.username}" created by ${req.user!.userId}`);
      res.status(201).json(user);
    } catch (err) { next(err); }
  }
);

// PATCH /api/users/:id/toggle-active
router.patch('/:id/toggle-active', requirePermission('user_management', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await db('users').where('id', req.params.id).first();
      if (!user) throw new AppError(404, 'User not found');
      if (user.id === req.user!.userId) throw new AppError(400, 'You cannot deactivate your own account');
      await assertCanManageRole(req, user.role_id);

      const isActive = !user.is_active;
      await db('users').where('id', user.id).update({
        is_active: isActive,
        // Deactivating revokes every outstanding token immediately.
        ...(isActive ? {} : { token_version: db.raw('token_version + 1') }),
        updated_at: new Date(),
      });
      invalidateUserAuthCache(user.id);
      logger.info(`User "${user.username}" ${isActive ? 'activated' : 'deactivated'} by ${req.user!.userId}`);
      res.json({ id: user.id, is_active: isActive });
    } catch (err) { next(err); }
  }
);

// PATCH /api/users/:id/reset-password   { newPassword }
//
// Sets a temporary password, clears any lockout, signs the user out everywhere
// and forces them to choose their own password at next login.
router.patch('/:id/reset-password', requirePermission('user_management', 'update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { newPassword } = z.object({ newPassword: z.string().min(1).max(200) }).parse(req.body);
      const user = await db('users').where('id', req.params.id).first();
      if (!user) throw new AppError(404, 'User not found');
      await assertCanManageRole(req, user.role_id);
      const problem = passwordProblem(newPassword, user.username);
      if (problem) throw new AppError(422, problem);

      await db('users').where('id', user.id).update({
        password_hash: await bcrypt.hash(newPassword, 12),
        password_changed_at: new Date(),
        must_change_password: user.id !== req.user!.userId,
        failed_login_count: 0,
        locked_until: null,
        token_version: db.raw('token_version + 1'),
        updated_at: new Date(),
      });
      invalidateUserAuthCache(user.id);
      logger.info(`Password for "${user.username}" reset by ${req.user!.userId}`);
      res.json({ id: user.id, message: 'Password reset. The user must choose a new password at next sign-in.' });
    } catch (err) { next(err); }
  }
);

// GET /api/users/roles
router.get('/roles', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const roles = await db('roles').where('is_active', true).select('id', 'name', 'slug', 'description');
    res.json(roles);
  } catch (err) { next(err); }
});

export default router;
