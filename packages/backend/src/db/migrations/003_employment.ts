import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Employments ───────────────────────────────
  await knex.schema.createTable('employments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
    t.uuid('campus_id').notNullable().references('id').inTable('campuses');
    t.uuid('department_id').notNullable().references('id').inTable('departments');
    t.string('job_title', 200).notNullable();
    t.string('job_group', 50);
    t.enum('contract_type', ['permanent', 'contract', 'probation', 'casual', 'internship']).notNullable();
    t.enum('status', ['active', 'on_leave', 'suspended', 'retired', 'resigned', 'terminated'])
      .notNullable()
      .defaultTo('active');
    t.date('start_date').notNullable();
    t.date('end_date').nullable();
    t.string('contract_path', 500);
    t.string('appointment_letter_path', 500);
    t.uuid('reporting_to_employee_id').nullable();
    t.timestamp('synced_at').nullable();
    t.timestamps(true, true);
  });

  // ── Salary History ────────────────────────────
  await knex.schema.createTable('salary_records', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('employment_id').notNullable().references('id').inTable('employments').onDelete('CASCADE');
    t.decimal('amount', 14, 2).notNullable();
    t.string('currency', 10).defaultTo('UGX');
    t.enum('payment_frequency', ['monthly', 'weekly', 'daily']).defaultTo('monthly');
    t.date('effective_date').notNullable();
    t.date('end_date').nullable();
    t.text('reason');
    t.uuid('approved_by').nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('salary_records');
  await knex.schema.dropTableIfExists('employments');
}
