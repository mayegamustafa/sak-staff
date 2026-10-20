import { Knex } from 'knex';

export async function up(knex: Knex) {
  // Expand approval_signature from varchar(300) to TEXT so it can hold a base64 PNG
  await knex.schema.alterTable('transfers', (t) => {
    t.text('approval_signature').alter();
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('transfers', (t) => {
    t.string('approval_signature', 300).alter();
  });
}
