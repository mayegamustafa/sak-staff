import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('documents', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
    t.enum('category', [
      'contract', 'appointment_letter', 'warning_letter', 'payslip',
      'evaluation', 'certificate', 'national_id', 'passport', 'cv', 'photo', 'other',
    ]).notNullable();
    t.string('title', 300).notNullable();
    t.string('file_path', 500).notNullable();
    t.string('mime_type', 100).notNullable();
    t.bigInteger('file_size_bytes').notNullable();
    t.uuid('uploaded_by').notNullable().references('id').inTable('users');
    t.date('issued_date').nullable();
    t.date('expiry_date').nullable();
    t.text('notes');
    t.timestamp('synced_at').nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('documents');
}
