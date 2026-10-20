import { Knex } from 'knex';

export async function up(knex: Knex) {
  await knex.schema.alterTable('transfers', (t) => {
    t.string('approval_role', 200).nullable(); // role/title of the approving officer (e.g. "General Manager")
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('transfers', (t) => {
    t.dropColumn('approval_role');
  });
}
