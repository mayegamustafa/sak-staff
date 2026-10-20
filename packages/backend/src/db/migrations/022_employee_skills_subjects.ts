import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', t => {
    t.text('other_skills').nullable();
    t.text('subjects_of_preference').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', t => {
    t.dropColumn('other_skills');
    t.dropColumn('subjects_of_preference');
  });
}
