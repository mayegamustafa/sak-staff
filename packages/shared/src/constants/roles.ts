// ─────────────────────────────────────────────
//  Role Definitions  (RBAC)
// ─────────────────────────────────────────────
import { RoleSlug } from '../types/user';

export const ROLES: Record<RoleSlug, { name: string; description: string }> = {
  super_admin: {
    name: 'Super Admin',
    description: 'Full system access – ICT / Director level',
  },
  hr: {
    name: 'Human Resources',
    description: 'Manages staff profiles, contracts, promotions',
  },
  quality_head: {
    name: 'Head of Quality Assurance',
    description: 'Manages performance appraisals and training',
  },
  general_manager: {
    name: 'General Manager',
    description: 'Strategic oversight, approvals, executive reports',
  },
  campus_admin: {
    name: 'Campus Admin',
    description: 'Phase 2 – campus-level administration (not active)',
  },
};
