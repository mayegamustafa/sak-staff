import { Knex } from 'knex';

/** Add approval comment, digital-signature, and approval date to transfers. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('transfers', (t) => {
    t.text('approval_comment').nullable();
    t.string('approval_signature', 300).nullable();  // typed name / initials as signature
    t.date('approval_date').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('transfers', (t) => {
    t.dropColumn('approval_comment');
    t.dropColumn('approval_signature');
    t.dropColumn('approval_date');
  });
}
