import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE employees ALTER COLUMN date_of_birth DROP NOT NULL');
}

export async function down(knex: Knex): Promise<void> {
  // Set a placeholder before restoring NOT NULL
  await knex.raw("UPDATE employees SET date_of_birth = '1900-01-01' WHERE date_of_birth IS NULL");
  await knex.raw('ALTER TABLE employees ALTER COLUMN date_of_birth SET NOT NULL');
}
