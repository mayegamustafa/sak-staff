import { Knex } from 'knex';

/**
 * Add department_id FK to job_titles so that job titles can be associated
 * with a specific department (enabling filtered dropdowns in transfer forms, etc.)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('job_titles', (t) => {
    t.uuid('department_id').nullable().references('id').inTable('departments').onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('job_titles', (t) => {
    t.dropColumn('department_id');
  });
}
