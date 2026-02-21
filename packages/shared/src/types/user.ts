// ─────────────────────────────────────────────
//  User / Auth Types  (RBAC)
// ─────────────────────────────────────────────

export type RoleSlug =
  | 'super_admin'
  | 'hr'
  | 'quality_head'
  | 'general_manager'
  | 'campus_admin';   // Phase 2 placeholder

export interface Role {
  id: string;
  name: string;
  slug: RoleSlug;
  description?: string;
  isActive: boolean;
}

export interface Permission {
  id: string;
  moduleKey: string;   // e.g. "staff_profiles"
  action: string;      // "create" | "read" | "update" | "delete" | "approve"
  description?: string;
}

export interface RolePermission {
  roleId: string;
  permissionId: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  roleId: string;
  employeeId?: string;    // link to staff profile (optional)
  campusId?: string;      // restrict to a campus (Phase 2)
  isActive: boolean;
  lastLoginAt?: string;
  passwordChangedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: Omit<User, 'passwordHash'> & { role: Role; permissions: string[] };
}

export type CreateUserDto = Pick<User, 'username' | 'email' | 'roleId' | 'employeeId' | 'campusId'> & {
  password: string;
};
