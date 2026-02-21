import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('staffing_establishment', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('campus_id').notNullable().references('id').inTable('campuses').onDelete('CASCADE');
    t.uuid('job_title_id').notNullable().references('id').inTable('job_titles').onDelete('CASCADE');
    t.integer('required_count').notNullable().defaultTo(1);
    t.text('notes').nullable();
    t.timestamps(true, true);
    t.unique(['campus_id', 'job_title_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('staffing_establishment');
}
