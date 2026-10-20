import type { Knex } from 'knex';

/**
 * Add short_code column to onboarding_tokens.
 * Short codes are 8-char URL-safe strings used to build
 * compact shareable links: /s/{short_code}
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('onboarding_tokens', (t) => {
    t.string('short_code', 12).nullable().unique();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('onboarding_tokens', (t) => {
    t.dropColumn('short_code');
  });
}
