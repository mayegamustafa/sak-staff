import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('trainings', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
    t.string('title', 300).notNullable();
    t.enum('type', ['workshop', 'seminar', 'course', 'conference', 'on_the_job', 'online']).notNullable();
    t.string('provider', 300).notNullable();
    t.string('venue', 300);
    t.date('start_date').notNullable();
    t.date('end_date').notNullable();
    t.integer('duration_days').notNullable();
    t.specificType('skills', 'text[]').defaultTo('{}');
    t.decimal('cost', 12, 2).nullable();
    t.string('currency', 10).defaultTo('UGX');
    t.enum('payment_by', ['employer', 'employee', 'sponsored']).nullable();
    t.string('certificate_path', 500);
    t.text('notes');
    t.timestamp('synced_at').nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('trainings');
}
