import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('bank_details', (t) => {
    t.uuid('id').primary();
    t.uuid('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
    t.string('bank_name', 100).notNullable();
    t.string('account_name', 150).notNullable();
    t.string('account_number', 50).notNullable();
    t.string('branch', 100).nullable();
    t.string('swift_code', 20).nullable();
    t.boolean('is_primary').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('bank_details');
}
