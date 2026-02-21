import type { Knex } from 'knex';

/**
 * Add campus_management permissions and assign them to super_admin.
 * This runs on top of the existing seeded data without disrupting users.
 */
export async function up(knex: Knex): Promise<void> {
  const newPerms = [
    { module_key: 'campus_management', action: 'create' },
    { module_key: 'campus_management', action: 'read' },
    { module_key: 'campus_management', action: 'update' },
    { module_key: 'campus_management', action: 'delete' },
  ];

  // Insert permissions if not already present
  for (const p of newPerms) {
    const exists = await knex('permissions')
      .where({ module_key: p.module_key, action: p.action })
      .first();
    if (!exists) {
      await knex('permissions').insert({ module_key: p.module_key, action: p.action });
    }
  }

  // Assign all campus_management permissions to super_admin
  const superAdmin = await knex('roles').where('slug', 'super_admin').first();
  if (superAdmin) {
    const perms = await knex('permissions').where('module_key', 'campus_management');
    for (const perm of perms) {
      const linked = await knex('role_permissions')
        .where({ role_id: superAdmin.id, permission_id: perm.id })
        .first();
      if (!linked) {
        await knex('role_permissions').insert({ role_id: superAdmin.id, permission_id: perm.id });
      }
    }
  }

  // Also assign to hr role (campus_management:read + create + update)
  const hr = await knex('roles').where('slug', 'hr').first();
  if (hr) {
    const readPerm = await knex('permissions')
      .where({ module_key: 'campus_management', action: 'read' })
      .first();
    if (readPerm) {
      const linked = await knex('role_permissions')
        .where({ role_id: hr.id, permission_id: readPerm.id })
        .first();
      if (!linked) {
        await knex('role_permissions').insert({ role_id: hr.id, permission_id: readPerm.id });
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const perms = await knex('permissions').where('module_key', 'campus_management');
  const ids = perms.map((p: { id: string }) => p.id);
  if (ids.length) {
    await knex('role_permissions').whereIn('permission_id', ids).del();
    await knex('permissions').where('module_key', 'campus_management').del();
  }
}
