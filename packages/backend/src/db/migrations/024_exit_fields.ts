import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (t) => {
    t.string('exit_reason', 50).nullable().after('is_active');
    t.date('exit_date').nullable().after('exit_reason');
    t.text('exit_notes').nullable().after('exit_date');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (t) => {
    t.dropColumn('exit_reason');
    t.dropColumn('exit_date');
    t.dropColumn('exit_notes');
  });
}
