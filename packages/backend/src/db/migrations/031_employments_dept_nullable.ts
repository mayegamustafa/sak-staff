import type { Knex } from 'knex';

/**
 * Make employments.department_id nullable so that employment records
 * can be created during onboarding approval without requiring a department.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE employments DROP CONSTRAINT IF EXISTS employments_department_id_foreign');
  await knex.raw('ALTER TABLE employments ALTER COLUMN department_id DROP NOT NULL');
  await knex.raw(`
    ALTER TABLE employments
      ADD CONSTRAINT employments_department_id_foreign
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Re-add NOT NULL (will fail if any nulls — acceptable for rollback)
  await knex.raw('ALTER TABLE employments ALTER COLUMN department_id SET NOT NULL');
}
