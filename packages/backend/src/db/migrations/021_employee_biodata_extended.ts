import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Extra columns on employees ────────────────────────────────────────────
  await knex.schema.alterTable('employees', (t) => {
    t.string('tribe', 100).nullable();
    t.date('date_appointed').nullable();
    t.string('spouse_name', 200).nullable();
    t.integer('no_of_children').nullable();
    t.string('whatsapp_phone', 30).nullable();
    t.string('type_of_work', 200).nullable();          // type of work applied for
    // Residence
    t.string('current_zone', 200).nullable();           // zone of current residence
    t.string('landlord_name', 200).nullable();
    t.text('parents_names').nullable();
    t.string('village', 200).nullable();
    t.string('village_zone', 200).nullable();
    t.text('village_direction').nullable();             // physical direction to village
    // Free-text sections
    t.text('other_job_interests').nullable();
    t.text('earlier_responsibilities').nullable();
    t.text('special_courses').nullable();
    t.text('medical_background').nullable();
    t.text('other_information').nullable();
    // Declaration (I certify…)
    t.string('declaration_name', 200).nullable();
    t.string('declaration_title', 200).nullable();
    t.text('declaration_signature').nullable();         // base64 PNG
    t.date('declaration_date').nullable();
    // Witnessed by
    t.string('witness_name', 200).nullable();
    t.string('witness_title', 200).nullable();
    t.text('witness_signature').nullable();             // base64 PNG
    t.string('witness_tel', 30).nullable();
  });

  // ── Add honours column to education_records ───────────────────────────────
  await knex.schema.alterTable('education_records', (t) => {
    t.string('honours', 300).nullable();               // any special honours
  });

  // ── Work / Employment history ─────────────────────────────────────────────
  await knex.schema.createTable('work_history', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('employee_id').notNullable()
      .references('id').inTable('employees').onDelete('CASCADE');
    t.string('period_from', 100).notNullable();        // e.g. "Jan 2018" or "2018"
    t.string('period_to', 100).notNullable();          // e.g. "Dec 2021" or "Present"
    t.string('organisation', 300).notNullable();
    t.string('title', 200).notNullable();
    t.string('supervisor_name', 200).nullable();
    t.timestamps(true, true);
  });

  // ── Referees ──────────────────────────────────────────────────────────────
  await knex.schema.createTable('employee_referees', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('employee_id').notNullable()
      .references('id').inTable('employees').onDelete('CASCADE');
    t.integer('ref_order').notNullable().defaultTo(1); // 1, 2, 3
    t.string('name', 200).notNullable();
    t.string('title', 200).nullable();
    t.string('phone', 50).nullable();
    t.string('email', 255).nullable();
    t.text('address').nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('employee_referees');
  await knex.schema.dropTableIfExists('work_history');

  await knex.schema.alterTable('education_records', (t) => {
    t.dropColumn('honours');
  });

  const dropCols = [
    'tribe', 'date_appointed', 'spouse_name', 'no_of_children',
    'whatsapp_phone', 'type_of_work',
    'current_zone', 'landlord_name', 'parents_names',
    'village', 'village_zone', 'village_direction',
    'other_job_interests', 'earlier_responsibilities', 'special_courses',
    'medical_background', 'other_information',
    'declaration_name', 'declaration_title', 'declaration_signature', 'declaration_date',
    'witness_name', 'witness_title', 'witness_signature', 'witness_tel',
  ];
  await knex.schema.alterTable('employees', (t) => {
    dropCols.forEach((c) => t.dropColumn(c));
  });
}
