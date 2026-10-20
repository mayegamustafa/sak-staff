import type { Knex } from 'knex';

// Reconstructed from the production schema (original source was lost).
// Guarded so it is a no-op where the column already exists.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('campuses', 'school_type')) return;
  await knex.raw(`
    ALTER TABLE campuses
      ADD COLUMN school_type varchar(20) NOT NULL DEFAULT 'day'
      CONSTRAINT campuses_school_type_check CHECK (school_type IN ('day', 'boarding'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('campuses', 'school_type')) {
    await knex.schema.alterTable('campuses', (t) => t.dropColumn('school_type'));
  }
}
