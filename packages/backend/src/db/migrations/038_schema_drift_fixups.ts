import type { Knex } from 'knex';

/**
 * Columns that exist in production but were added by hand, never through a
 * migration. Without them a fresh install (new server, disaster recovery)
 * breaks onboarding links, HR approvals and staffing gaps. Each is guarded,
 * so this is a no-op on the existing production database.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('onboarding_tokens', 'campus_id'))) {
    await knex.raw(`
      ALTER TABLE onboarding_tokens
        ADD COLUMN campus_id uuid
        CONSTRAINT onboarding_tokens_campus_id_fkey REFERENCES campuses(id) ON DELETE SET NULL
    `);
  }
  if (!(await knex.schema.hasColumn('onboarding_tokens', 'submission_count'))) {
    await knex.raw('ALTER TABLE onboarding_tokens ADD COLUMN submission_count integer NOT NULL DEFAULT 0');
  }
  if (!(await knex.schema.hasColumn('employees', 'approval_status'))) {
    await knex.raw("ALTER TABLE employees ADD COLUMN approval_status varchar(20) NOT NULL DEFAULT 'approved'");
  }
  // Station a self-registered new hire signed up through; used when HR approves
  // them to create the employment record. The onboarding code already expected
  // this column, so station-link submissions failed without it.
  if (!(await knex.schema.hasColumn('employees', 'campus_id'))) {
    await knex.raw(`
      ALTER TABLE employees
        ADD COLUMN campus_id uuid
        CONSTRAINT employees_campus_id_foreign REFERENCES campuses(id) ON DELETE SET NULL
    `);
  }
  if (!(await knex.schema.hasColumn('job_titles', 'required_headcount'))) {
    await knex.raw('ALTER TABLE job_titles ADD COLUMN required_headcount integer');
  }
}

// Intentionally irreversible: these columns hold live production data.
export async function down(_knex: Knex): Promise<void> {}
