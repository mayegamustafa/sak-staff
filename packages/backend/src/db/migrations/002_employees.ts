import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Campuses ─────────────────────────────────
  await knex.schema.createTable('campuses', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 200).notNullable();
    t.string('code', 30).notNullable().unique();
    t.text('address');
    t.string('phone', 30);
    t.string('email', 255);
    t.uuid('principal_employee_id').nullable();
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  // ── Departments ───────────────────────────────
  await knex.schema.createTable('departments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 200).notNullable();
    t.string('code', 30).notNullable();
    t.uuid('campus_id').notNullable().references('id').inTable('campuses').onDelete('CASCADE');
    t.uuid('head_employee_id').nullable();
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
    t.unique(['code', 'campus_id']);
  });

  // ── Employees ─────────────────────────────────
  await knex.schema.createTable('employees', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('staff_no', 30).notNullable().unique();
    t.string('first_name', 100).notNullable();
    t.string('middle_name', 100);
    t.string('last_name', 100).notNullable();
    t.enum('gender', ['male', 'female', 'other']).notNullable();
    t.date('date_of_birth').notNullable();
    t.string('nationality', 100).defaultTo('Ugandan');
    t.string('national_id', 50);
    t.string('passport_no', 50);
    t.enum('marital_status', ['single', 'married', 'divorced', 'widowed']);
    t.string('blood_group', 10);
    t.string('religion', 100);
    t.string('phone', 30).notNullable();
    t.string('phone2', 30);
    t.string('email', 255);
    t.text('residential_address');
    t.string('photo_path', 500);
    t.string('cv_path', 500);
    t.boolean('is_active').defaultTo(true);
    t.timestamp('synced_at').nullable();
    t.timestamps(true, true);
  });

  // ── Emergency Contacts ────────────────────────
  await knex.schema.createTable('emergency_contacts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
    t.string('full_name', 200).notNullable();
    t.string('relationship', 100).notNullable();
    t.string('phone', 30).notNullable();
    t.string('phone2', 30);
    t.text('address');
    t.timestamps(true, true);
  });

  // ── Education Records ─────────────────────────
  await knex.schema.createTable('education_records', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
    t.string('institution', 300).notNullable();
    t.string('qualification', 200).notNullable();
    t.string('field_of_study', 200).notNullable();
    t.integer('year_from').notNullable();
    t.integer('year_to').notNullable();
    t.string('grade', 50);
    t.string('document_path', 500);
    t.timestamps(true, true);
  });

  // ── Certifications ────────────────────────────
  await knex.schema.createTable('certifications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
    t.string('name', 300).notNullable();
    t.string('issuing_body', 300).notNullable();
    t.date('issue_date').notNullable();
    t.date('expiry_date').nullable();
    t.string('document_path', 500);
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('certifications');
  await knex.schema.dropTableIfExists('education_records');
  await knex.schema.dropTableIfExists('emergency_contacts');
  await knex.schema.dropTableIfExists('employees');
  await knex.schema.dropTableIfExists('departments');
  await knex.schema.dropTableIfExists('campuses');
}
