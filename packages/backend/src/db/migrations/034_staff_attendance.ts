import type { Knex } from 'knex';

// Reconstructed from the production schema: the original source of this
// migration was lost, which left fresh installs unable to migrate past 036.
// Guarded with hasTable so it is a no-op on databases that already have them.
// (week_number on staff_attendance_absences is added by 036.)
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('staff_attendance'))) {
    await knex.schema.createTable('staff_attendance', (t) => {
      t.uuid('id').primary();
      t.uuid('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
      t.integer('year').notNullable();
      t.string('term', 5).notNullable();
      t.integer('weeks').notNullable();
      t.string('school_type', 20).notNullable();
      t.integer('days_present').notNullable();
      t.text('notes');
      t.uuid('recorded_by').references('id').inTable('users').onDelete('SET NULL');
      t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.unique(['employee_id', 'year', 'term']);
    });
    await knex.raw(`
      ALTER TABLE staff_attendance
        ADD CONSTRAINT staff_attendance_days_check CHECK (days_present >= 0),
        ADD CONSTRAINT staff_attendance_school_type_check CHECK (school_type IN ('day', 'boarding')),
        ADD CONSTRAINT staff_attendance_term_check CHECK (term IN ('I', 'II', 'III')),
        ADD CONSTRAINT staff_attendance_weeks_check CHECK (weeks >= 1 AND weeks <= 52)
    `);
  }

  if (!(await knex.schema.hasTable('staff_attendance_absences'))) {
    await knex.schema.createTable('staff_attendance_absences', (t) => {
      t.uuid('id').primary();
      t.uuid('attendance_id').notNullable().references('id').inTable('staff_attendance').onDelete('CASCADE');
      t.integer('days').notNullable().defaultTo(1);
      t.string('reason', 200).notNullable();
      t.text('notes');
      t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    });
    await knex.raw('ALTER TABLE staff_attendance_absences ADD CONSTRAINT staff_attendance_absences_days_check CHECK (days > 0)');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('staff_attendance_absences');
  await knex.schema.dropTableIfExists('staff_attendance');
}
