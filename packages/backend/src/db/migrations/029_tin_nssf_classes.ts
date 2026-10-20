import type { Knex } from 'knex';

/**
 * Add TIN, NSSF number to employees and create employee_classes join table
 * so teachers can be linked to one or more school classes.
 */
export async function up(knex: Knex): Promise<void> {
  // ── TIN & NSSF on employees ───────────────────────────────────────────────
  await knex.schema.alterTable('employees', (t) => {
    t.string('tin', 50).nullable();          // Uganda Revenue Authority TIN
    t.string('nssf_number', 50).nullable();  // National Social Security Fund
  });

  // ── employee_classes (many-to-many: employee ↔ school_classes) ───────────
  await knex.schema.createTable('employee_classes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('employee_id').notNullable()
      .references('id').inTable('employees').onDelete('CASCADE');
    t.uuid('class_id').notNullable()
      .references('id').inTable('school_classes').onDelete('CASCADE');
    t.timestamps(true, true);
    t.unique(['employee_id', 'class_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('employee_classes');
  await knex.schema.alterTable('employees', (t) => {
    t.dropColumn('tin');
    t.dropColumn('nssf_number');
  });
}
