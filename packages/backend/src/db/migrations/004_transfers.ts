import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('transfers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
    t.enum('type', ['transfer', 'promotion', 'demotion', 'acting', 'temporary_assignment']).notNullable();
    t.enum('status', ['pending', 'approved', 'rejected', 'completed']).defaultTo('pending');
    t.uuid('from_campus_id').notNullable().references('id').inTable('campuses');
    t.uuid('to_campus_id').notNullable().references('id').inTable('campuses');
    t.uuid('from_department_id').nullable();
    t.uuid('to_department_id').nullable();
    t.string('from_job_title', 200);
    t.string('to_job_title', 200);
    t.date('effective_date').notNullable();
    t.date('end_date').nullable();
    t.text('reason').notNullable();
    t.text('notes');
    t.uuid('recommended_by').nullable();
    t.uuid('approved_by').nullable();
    t.timestamp('approved_at').nullable();
    t.timestamp('synced_at').nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('transfers');
}
