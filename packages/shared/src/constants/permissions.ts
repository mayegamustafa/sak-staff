// ─────────────────────────────────────────────
//  Permission Matrix  (RBAC)
//  module:action  format
// ─────────────────────────────────────────────

export const MODULES = {
  STAFF_PROFILES: 'staff_profiles',
  EMPLOYMENT: 'employment',
  TRANSFERS: 'transfers',
  PERFORMANCE: 'performance',
  TRAINING: 'training',
  DOCUMENTS: 'documents',
  REPORTS: 'reports',
  USER_MANAGEMENT: 'user_management',
  SYSTEM_SETTINGS: 'system_settings',
} as const;

export const ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  APPROVE: 'approve',
  EXPORT: 'export',
} as const;

/**
 * Permission matrix per role.
 * Format: "module:action"
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: [
    // Full access to everything
    ...Object.values(MODULES).flatMap((m) =>
      Object.values(ACTIONS).map((a) => `${m}:${a}`)
    ),
  ],

  hr: [
    `${MODULES.STAFF_PROFILES}:${ACTIONS.CREATE}`,
    `${MODULES.STAFF_PROFILES}:${ACTIONS.READ}`,
    `${MODULES.STAFF_PROFILES}:${ACTIONS.UPDATE}`,
    `${MODULES.STAFF_PROFILES}:${ACTIONS.DELETE}`,
    `${MODULES.EMPLOYMENT}:${ACTIONS.CREATE}`,
    `${MODULES.EMPLOYMENT}:${ACTIONS.READ}`,
    `${MODULES.EMPLOYMENT}:${ACTIONS.UPDATE}`,
    `${MODULES.EMPLOYMENT}:${ACTIONS.DELETE}`,
    `${MODULES.TRANSFERS}:${ACTIONS.CREATE}`,
    `${MODULES.TRANSFERS}:${ACTIONS.READ}`,
    `${MODULES.TRANSFERS}:${ACTIONS.UPDATE}`,
    `${MODULES.PERFORMANCE}:${ACTIONS.READ}`,
    `${MODULES.TRAINING}:${ACTIONS.CREATE}`,
    `${MODULES.TRAINING}:${ACTIONS.READ}`,
    `${MODULES.TRAINING}:${ACTIONS.UPDATE}`,
    `${MODULES.DOCUMENTS}:${ACTIONS.CREATE}`,
    `${MODULES.DOCUMENTS}:${ACTIONS.READ}`,
    `${MODULES.DOCUMENTS}:${ACTIONS.UPDATE}`,
    `${MODULES.DOCUMENTS}:${ACTIONS.DELETE}`,
    `${MODULES.REPORTS}:${ACTIONS.READ}`,
    `${MODULES.REPORTS}:${ACTIONS.EXPORT}`,
  ],

  quality_head: [
    `${MODULES.STAFF_PROFILES}:${ACTIONS.READ}`,
    `${MODULES.EMPLOYMENT}:${ACTIONS.READ}`,
    `${MODULES.TRANSFERS}:${ACTIONS.READ}`,
    `${MODULES.PERFORMANCE}:${ACTIONS.CREATE}`,
    `${MODULES.PERFORMANCE}:${ACTIONS.READ}`,
    `${MODULES.PERFORMANCE}:${ACTIONS.UPDATE}`,
    `${MODULES.PERFORMANCE}:${ACTIONS.DELETE}`,
    `${MODULES.TRAINING}:${ACTIONS.CREATE}`,
    `${MODULES.TRAINING}:${ACTIONS.READ}`,
    `${MODULES.TRAINING}:${ACTIONS.UPDATE}`,
    `${MODULES.DOCUMENTS}:${ACTIONS.READ}`,
    `${MODULES.REPORTS}:${ACTIONS.READ}`,
    `${MODULES.REPORTS}:${ACTIONS.EXPORT}`,
  ],

  general_manager: [
    `${MODULES.STAFF_PROFILES}:${ACTIONS.READ}`,
    `${MODULES.EMPLOYMENT}:${ACTIONS.READ}`,
    `${MODULES.TRANSFERS}:${ACTIONS.READ}`,
    `${MODULES.TRANSFERS}:${ACTIONS.APPROVE}`,
    `${MODULES.PERFORMANCE}:${ACTIONS.READ}`,
    `${MODULES.TRAINING}:${ACTIONS.READ}`,
    `${MODULES.DOCUMENTS}:${ACTIONS.READ}`,
    `${MODULES.REPORTS}:${ACTIONS.READ}`,
    `${MODULES.REPORTS}:${ACTIONS.EXPORT}`,
  ],

  campus_admin: [
    // Phase 2 – restricted set, to be expanded
    `${MODULES.STAFF_PROFILES}:${ACTIONS.READ}`,
  ],
};

export function hasPermission(
  userPermissions: string[],
  module: string,
  action: string
): boolean {
  return userPermissions.includes(`${module}:${action}`);
}
