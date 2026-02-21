import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Roles ────────────────────────────────────
  await knex.schema.createTable('roles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 100).notNullable();
    t.string('slug', 50).notNullable().unique();
    t.text('description');
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  // ── Permissions ──────────────────────────────
  await knex.schema.createTable('permissions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('module_key', 100).notNullable();
    t.string('action', 50).notNullable();
    t.text('description');
    t.unique(['module_key', 'action']);
  });

  // ── Role Permissions (join) ───────────────────
  await knex.schema.createTable('role_permissions', (t) => {
    t.uuid('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE');
    t.uuid('permission_id').notNullable().references('id').inTable('permissions').onDelete('CASCADE');
    t.primary(['role_id', 'permission_id']);
  });

  // ── Users ────────────────────────────────────
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('username', 100).notNullable().unique();
    t.string('email', 255).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.uuid('role_id').notNullable().references('id').inTable('roles');
    t.uuid('employee_id').nullable();
    t.uuid('campus_id').nullable();
    t.boolean('is_active').defaultTo(true);
    t.timestamp('last_login_at').nullable();
    t.timestamp('password_changed_at').nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('role_permissions');
  await knex.schema.dropTableIfExists('permissions');
  await knex.schema.dropTableIfExists('roles');
}
