import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── academic_weeks: term/week scaffold (dates optional) ─────────────────────
  await knex.schema.createTable('academic_weeks', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.integer('year').notNullable();
    t.string('term', 5).notNullable();           // 'I', 'II', 'III'
    t.integer('week_number').notNullable();       // 1–13
    t.date('start_date').nullable();
    t.date('end_date').nullable();
    t.timestamps(true, true);
    t.unique(['year', 'term', 'week_number']);
  });

  // ── staff_attendance_absences: add week_number for week-level filtering ─────
  await knex.schema.alterTable('staff_attendance_absences', (t) => {
    t.integer('week_number').nullable().comment('Academic week (1–13) this absence falls in');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('staff_attendance_absences', (t) => {
    t.dropColumn('week_number');
  });
  await knex.schema.dropTableIfExists('academic_weeks');
}
