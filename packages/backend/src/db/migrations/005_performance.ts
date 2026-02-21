import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('appraisals', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
    t.uuid('supervisor_id').notNullable().references('id').inTable('employees');
    t.enum('period', ['term_1', 'term_2', 'term_3', 'annual', 'probation']).notNullable();
    t.string('academic_year', 20).notNullable();   // e.g. "2025/2026"
    t.date('conducted_date').notNullable();
    t.decimal('overall_score', 4, 2).notNullable();
    t.string('overall_rating', 50);
    t.text('supervisor_comments');
    t.text('employee_comments');
    t.boolean('is_eligible_for_promotion').defaultTo(false);
    t.timestamp('synced_at').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('kpis', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('appraisal_id').notNullable().references('id').inTable('appraisals').onDelete('CASCADE');
    t.text('description').notNullable();
    t.text('target').notNullable();
    t.text('actual_achievement').notNullable();
    t.decimal('weight', 5, 2).notNullable();
    t.integer('score').notNullable();  // 1–5
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('kpis');
  await knex.schema.dropTableIfExists('appraisals');
}
