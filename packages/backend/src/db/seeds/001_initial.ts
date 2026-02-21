import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';
import { ROLES, ROLE_PERMISSIONS } from '@sak/shared';

const ROLES_DATA = [
  { slug: 'super_admin', name: 'Super Admin', description: 'Full system access – ICT / Director level' },
  { slug: 'hr', name: 'Human Resources', description: 'Manages staff profiles, contracts, promotions' },
  { slug: 'quality_head', name: 'Head of Quality Assurance', description: 'Manages performance and training' },
  { slug: 'general_manager', name: 'General Manager', description: 'Strategic oversight and approvals' },
  { slug: 'campus_admin', name: 'Campus Admin', description: 'Phase 2 – campus-level administration (not active)' },
];

const PERMISSIONS_DATA = [
  // Staff Profiles
  { module_key: 'staff_profiles', action: 'create' },
  { module_key: 'staff_profiles', action: 'read' },
  { module_key: 'staff_profiles', action: 'update' },
  { module_key: 'staff_profiles', action: 'delete' },
  // Employment
  { module_key: 'employment', action: 'create' },
  { module_key: 'employment', action: 'read' },
  { module_key: 'employment', action: 'update' },
  { module_key: 'employment', action: 'delete' },
  // Transfers
  { module_key: 'transfers', action: 'create' },
  { module_key: 'transfers', action: 'read' },
  { module_key: 'transfers', action: 'update' },
  { module_key: 'transfers', action: 'approve' },
  { module_key: 'transfers', action: 'delete' },
  // Performance
  { module_key: 'performance', action: 'create' },
  { module_key: 'performance', action: 'read' },
  { module_key: 'performance', action: 'update' },
  { module_key: 'performance', action: 'delete' },
  // Training
  { module_key: 'training', action: 'create' },
  { module_key: 'training', action: 'read' },
  { module_key: 'training', action: 'update' },
  { module_key: 'training', action: 'delete' },
  // Documents
  { module_key: 'documents', action: 'create' },
  { module_key: 'documents', action: 'read' },
  { module_key: 'documents', action: 'update' },
  { module_key: 'documents', action: 'delete' },
  // Reports
  { module_key: 'reports', action: 'read' },
  { module_key: 'reports', action: 'export' },
  // User Management
  { module_key: 'user_management', action: 'create' },
  { module_key: 'user_management', action: 'read' },
  { module_key: 'user_management', action: 'update' },
  { module_key: 'user_management', action: 'delete' },
  // System Settings
  { module_key: 'system_settings', action: 'read' },
  { module_key: 'system_settings', action: 'update' },
];

const ROLE_PERMISSIONS_MAP: Record<string, string[]> = {
  super_admin: PERMISSIONS_DATA.map((p) => `${p.module_key}:${p.action}`),
  hr: [
    'staff_profiles:create', 'staff_profiles:read', 'staff_profiles:update', 'staff_profiles:delete',
    'employment:create', 'employment:read', 'employment:update', 'employment:delete',
    'transfers:create', 'transfers:read', 'transfers:update',
    'performance:read',
    'training:create', 'training:read', 'training:update',
    'documents:create', 'documents:read', 'documents:update', 'documents:delete',
    'reports:read', 'reports:export',
  ],
  quality_head: [
    'staff_profiles:read', 'employment:read', 'transfers:read',
    'performance:create', 'performance:read', 'performance:update', 'performance:delete',
    'training:create', 'training:read', 'training:update',
    'documents:read', 'reports:read', 'reports:export',
  ],
  general_manager: [
    'staff_profiles:read', 'employment:read', 'transfers:read', 'transfers:approve',
    'performance:read', 'training:read', 'documents:read',
    'reports:read', 'reports:export',
  ],
  campus_admin: ['staff_profiles:read'],
};

export async function seed(knex: Knex): Promise<void> {
  // Clean existing seed data
  await knex('role_permissions').del();
  await knex('permissions').del();
  await knex('roles').del();

  // Insert roles
  const insertedRoles = await knex('roles').insert(
    ROLES_DATA.map((r) => ({ ...r, is_active: true }))
  ).returning(['id', 'slug']);

  const roleMap = Object.fromEntries(insertedRoles.map((r: { id: string; slug: string }) => [r.slug, r.id]));

  // Insert permissions
  const insertedPerms = await knex('permissions').insert(PERMISSIONS_DATA).returning(['id', 'module_key', 'action']);
  const permMap = Object.fromEntries(
    insertedPerms.map((p: { id: string; module_key: string; action: string }) => [`${p.module_key}:${p.action}`, p.id])
  );

  // Insert role_permissions
  const rolePerm: { role_id: string; permission_id: string }[] = [];
  for (const [slug, perms] of Object.entries(ROLE_PERMISSIONS_MAP)) {
    for (const perm of perms) {
      if (permMap[perm] && roleMap[slug]) {
        rolePerm.push({ role_id: roleMap[slug], permission_id: permMap[perm] });
      }
    }
  }
  await knex('role_permissions').insert(rolePerm);

  // Default Super Admin user
  const existing = await knex('users').where('username', 'superadmin').first();
  if (!existing) {
    const hash = await bcrypt.hash('Admin@SAK2026', 12);
    await knex('users').insert({
      username: 'superadmin',
      email: 'admin@sakaggwa.ac.ug',
      password_hash: hash,
      role_id: roleMap['super_admin'],
      is_active: true,
    });
  }

  // Default campus
  const existingCampus = await knex('campuses').where('code', 'SAK-MAIN').first();
  if (!existingCampus) {
    await knex('campuses').insert({
      name: 'Sir Apollo Kaggwa Schools – Main Campus',
      code: 'SAK-MAIN',
      address: 'Kampala, Uganda',
      email: 'info@sakaggwa.ac.ug',
      is_active: true,
    });
  }
}
