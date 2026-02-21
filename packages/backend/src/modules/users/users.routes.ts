import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
router.use(authenticate);
router.use(requirePermission('user_management', 'read'));

const CreateUserSchema = z.object({
  username: z.string().min(3).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  roleId: z.string().uuid(),
  employeeId: z.string().uuid().optional(),
  campusId: z.string().uuid().optional(),
});

// GET /api/users
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await db('users')
      .join('roles', 'users.role_id', 'roles.id')
      .select('users.id', 'users.username', 'users.email', 'users.is_active',
              'users.last_login_at', 'users.created_at',
              'roles.name as role_name', 'roles.slug as role_slug');
    res.json(users);
  } catch (err) { next(err); }
});

// POST /api/users
router.post('/', requirePermission('user_management', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = CreateUserSchema.parse(req.body);
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
      }).returning(['id', 'username', 'email', 'role_id', 'is_active', 'created_at']);
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
      await db('users').where('id', req.params.id).update({ is_active: !user.is_active });
      res.json({ id: req.params.id, is_active: !user.is_active });
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
