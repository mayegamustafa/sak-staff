import type { Knex } from 'knex';

/** Rename job_group → pay_grade in job_titles and employment_records. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('job_titles', (t) => {
    t.renameColumn('job_group', 'pay_grade');
  });
  await knex.schema.table('employments', (t) => {
    t.renameColumn('job_group', 'pay_grade');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('employments', (t) => {
    t.renameColumn('pay_grade', 'job_group');
  });
  await knex.schema.table('job_titles', (t) => {
    t.renameColumn('pay_grade', 'job_group');
  });
}
