import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';

/**
 * Session revocation, forced password changes and account lockout.
 *
 *   token_version        – embedded in every JWT; bumping it invalidates all of a
 *                          user's existing access and refresh tokens at once
 *                          (password change, deactivation, admin reset, logout-all).
 *   must_change_password – set for seeded/admin-reset accounts; the API refuses
 *                          everything except /api/auth/* until it is cleared.
 *   failed_login_count / locked_until – DB-backed lockout, so it survives
 *                          restarts and applies across multiple app instances.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.integer('token_version').notNullable().defaultTo(0);
    t.boolean('must_change_password').notNullable().defaultTo(false);
    t.integer('failed_login_count').notNullable().defaultTo(0);
    t.timestamp('locked_until').nullable();
  });

  // The seed used to create `superadmin` with a password that is published in
  // the source repository. If it was never changed, force a change on next login.
  const admin = await knex('users').where('username', 'superadmin').first();
  if (admin && await bcrypt.compare('Admin@SAK2026', admin.password_hash)) {
    await knex('users').where('id', admin.id).update({ must_change_password: true });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('token_version');
    t.dropColumn('must_change_password');
    t.dropColumn('failed_login_count');
    t.dropColumn('locked_until');
  });
}
