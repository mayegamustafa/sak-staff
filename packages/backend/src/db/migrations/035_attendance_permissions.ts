import type { Knex } from 'knex';

// Reconstructed from the production database (original source was lost).
// Idempotent: existing permissions and grants are left alone.
const GRANTS: Record<string, string[]> = {
  'attendance:read':   ['super_admin', 'hr', 'quality_head', 'general_manager'],
  'attendance:create': ['super_admin', 'hr', 'quality_head'],
  'attendance:update': ['super_admin', 'hr', 'quality_head'],
  'attendance:delete': ['super_admin', 'hr', 'quality_head'],
};

export async function up(knex: Knex): Promise<void> {
  for (const [perm, roles] of Object.entries(GRANTS)) {
    const [module_key, action] = perm.split(':');
    let row = await knex('permissions').where({ module_key, action }).first();
    if (!row) {
      [row] = await knex('permissions')
        .insert({ module_key, action, description: `Attendance – ${action}` })
        .returning(['id']);
    }
    for (const slug of roles) {
      const role = await knex('roles').where({ slug }).first();
      if (!role) continue;
      await knex('role_permissions')
        .insert({ role_id: role.id, permission_id: row.id })
        .onConflict(['role_id', 'permission_id'])
        .ignore();
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('permissions').where('module_key', 'attendance').del();
}
