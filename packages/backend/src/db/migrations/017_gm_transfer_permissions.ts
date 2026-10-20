import { Knex } from 'knex';
import bcrypt from 'bcryptjs';

/**
 * Ensure General Manager has full transfer permissions:
 *   transfers: create, read, update, approve, delete
 *
 * Also sets a known default password for the GM user if the
 * password_hash still matches a blank/unknown state.
 *
 * "super_admin" already inherits everything via the super_admin
 * short-circuit in the auth middleware – no DB change needed.
 */
export async function up(knex: Knex): Promise<void> {
  const gm = await knex('roles').where('slug', 'general_manager').first();
  if (!gm) return; // safety – role must exist

  const needed = ['create', 'read', 'update', 'approve', 'delete'];

  for (const action of needed) {
    const perm = await knex('permissions')
      .where({ module_key: 'transfers', action })
      .first();
    if (!perm) continue;

    const exists = await knex('role_permissions')
      .where({ role_id: gm.id, permission_id: perm.id })
      .first();

    if (!exists) {
      await knex('role_permissions').insert({ role_id: gm.id, permission_id: perm.id });
    }
  }

  // Reset GM user password to GM@SAK2026 so it is always known
  const gmUser = await knex('users')
    .where('role_id', gm.id)
    .first();

  if (gmUser) {
    const hash = await bcrypt.hash('GM@SAK2026', 12);
    await knex('users')
      .where('id', gmUser.id)
      .update({ password_hash: hash, updated_at: new Date() });
  }
}

export async function down(knex: Knex): Promise<void> {
  const gm = await knex('roles').where('slug', 'general_manager').first();
  if (!gm) return;

  // Remove the Extra permissions added (keep read + approve which were original)
  const toRemove = ['create', 'update', 'delete'];
  for (const action of toRemove) {
    const perm = await knex('permissions')
      .where({ module_key: 'transfers', action })
      .first();
    if (!perm) continue;
    await knex('role_permissions')
      .where({ role_id: gm.id, permission_id: perm.id })
      .delete();
  }
}
