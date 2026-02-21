import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import db from '../db';

export interface JWTPayload {
  userId: string;
  roleSlug: string;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret) as JWTPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
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
