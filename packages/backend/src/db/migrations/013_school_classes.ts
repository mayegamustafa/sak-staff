import type { Knex } from 'knex';

/**
 * School classes and streams.
 * - school_classes: a class definition, optionally scoped to one campus.
 *   campus_id = NULL → org-wide (e.g. a class available in all stations).
 * - class_streams: named streams (A, B, West, East, …) within a class at a campus.
 */
export async function up(knex: Knex): Promise<void> {
  // ── school_classes ────────────────────────────────────────────────────────
  await knex.schema.createTable('school_classes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('campus_id').nullable()
      .references('id').inTable('campuses').onDelete('CASCADE');
    t.string('name', 30).notNullable();          // e.g. "KG 1", "P.1", "S.1"
    t.enum('level', ['kindergarten', 'primary']).notNullable();
    t.integer('display_order').notNullable().defaultTo(0);
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
    // One class name per campus (or one global class name if campus_id is null)
    t.unique(['campus_id', 'name']);
  });

  // ── class_streams ─────────────────────────────────────────────────────────
  await knex.schema.createTable('class_streams', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('class_id').notNullable()
      .references('id').inTable('school_classes').onDelete('CASCADE');
    t.string('name', 50).notNullable();          // e.g. "A", "B", "East", "West"
    t.integer('display_order').notNullable().defaultTo(0);
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('class_streams');
  await knex.schema.dropTableIfExists('school_classes');
}
