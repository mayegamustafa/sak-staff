import type { Knex } from 'knex';

/**
 * 1. Rename job_titles categories to match user terminology.
 * 2. Make departments.campus_id nullable (departments are org-wide).
 */
export async function up(knex: Knex): Promise<void> {
  // ── 1. Job title categories ────────────────────────────────────────────────
  // Knex t.enu() creates a VARCHAR + CHECK constraint.
  // Drop the old constraint, remap data, add new constraint.

  await knex.raw(`
    ALTER TABLE job_titles
      DROP CONSTRAINT IF EXISTS job_titles_category_check;
  `);

  // Remap old → new values
  await knex('job_titles').where('category', 'teaching')      .update({ category: 'teaching_staff' });
  await knex('job_titles').where('category', 'administrative').update({ category: 'non_teaching_professional' });
  await knex('job_titles').where('category', 'support')       .update({ category: 'support_staff' });
  await knex('job_titles').where('category', 'management')    .update({ category: 'manager' });
  await knex('job_titles').where('category', 'other')         .update({ category: 'support_staff' });

  await knex.raw(`
    ALTER TABLE job_titles
      ADD CONSTRAINT job_titles_category_check
        CHECK (category IN (
          'teaching_staff',
          'non_teaching_professional',
          'support_staff',
          'administrator',
          'manager'
        ));
  `);

  // Update the default value too
  await knex.raw(`
    ALTER TABLE job_titles
      ALTER COLUMN category SET DEFAULT 'support_staff';
  `);

  // ── 2. Departments — make campus_id optional (org-wide) ────────────────────
  // Drop old NOT NULL FK and unique(code, campus_id)
  await knex.raw(`
    ALTER TABLE departments
      DROP CONSTRAINT IF EXISTS departments_campus_id_foreign;
  `);

  await knex.raw(`
    ALTER TABLE departments
      DROP CONSTRAINT IF EXISTS departments_code_campus_id_unique;
  `);

  await knex.raw(`
    ALTER TABLE departments
      ALTER COLUMN campus_id DROP NOT NULL;
  `);

  // Re-add as nullable FK (SET NULL on campus delete instead of CASCADE)
  await knex.raw(`
    ALTER TABLE departments
      ADD CONSTRAINT departments_campus_id_foreign
        FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE SET NULL;
  `);

  // Globally unique code
  await knex.raw(`
    ALTER TABLE departments
      ADD CONSTRAINT departments_code_unique UNIQUE (code);
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Revert departments
  await knex.raw(`ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_code_unique;`);
  await knex.raw(`ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_campus_id_foreign;`);
  await knex.raw(`ALTER TABLE departments ALTER COLUMN campus_id SET NOT NULL;`);
  await knex.raw(`
    ALTER TABLE departments
      ADD CONSTRAINT departments_campus_id_foreign
        FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE;
  `);
  await knex.raw(`
    ALTER TABLE departments
      ADD CONSTRAINT departments_code_campus_id_unique UNIQUE (code, campus_id);
  `);

  // Revert job_titles
  await knex.raw(`ALTER TABLE job_titles DROP CONSTRAINT IF EXISTS job_titles_category_check;`);
  await knex('job_titles').where('category', 'teaching_staff')          .update({ category: 'teaching' });
  await knex('job_titles').where('category', 'non_teaching_professional').update({ category: 'administrative' });
  await knex('job_titles').where('category', 'support_staff')           .update({ category: 'support' });
  await knex('job_titles').where('category', 'manager')                 .update({ category: 'management' });
  await knex.raw(`
    ALTER TABLE job_titles
      ADD CONSTRAINT job_titles_category_check
        CHECK (category IN ('teaching','administrative','support','management','other'));
  `);
  await knex.raw(`ALTER TABLE job_titles ALTER COLUMN category SET DEFAULT 'other';`);
}
