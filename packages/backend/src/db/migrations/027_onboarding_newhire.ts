import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add new columns to onboarding_tokens
  await knex.schema.alterTable('onboarding_tokens', (t) => {
    t.string('token_type', 20).notNullable().defaultTo('new_hire');
    t.string('whatsapp_number', 30).nullable();
    t.string('recipient_name', 255).nullable();
  });

  // Make employee_id nullable (drop + re-add constraint)
  await knex.raw('ALTER TABLE onboarding_tokens DROP CONSTRAINT IF EXISTS onboarding_tokens_employee_id_foreign');
  await knex.raw('ALTER TABLE onboarding_tokens ALTER COLUMN employee_id DROP NOT NULL');
  await knex.raw(`
    ALTER TABLE onboarding_tokens
      ADD CONSTRAINT onboarding_tokens_employee_id_foreign
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  `);

  // Mark any existing tokens as 'update' type (they were linked to employees)
  await knex('onboarding_tokens').update({ token_type: 'update' });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('onboarding_tokens', (t) => {
    t.dropColumn('token_type');
    t.dropColumn('whatsapp_number');
    t.dropColumn('recipient_name');
  });
  // Restore NOT NULL (may fail if any nulls exist — acceptable for rollback)
  await knex.raw('ALTER TABLE onboarding_tokens ALTER COLUMN employee_id SET NOT NULL');
}
