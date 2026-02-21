import type { Knex } from 'knex';

// Change documents.category from a rigid enum to a flexible varchar so the
// frontend can use any category labels (academic, professional, contract, etc.)
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('documents', (t) => {
    t.string('category', 50).notNullable().defaultTo('other').alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  // Cannot revert varchar back to the old Postgres enum cleanly – no-op on rollback
}
