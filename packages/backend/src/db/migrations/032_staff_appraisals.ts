import type { Knex } from 'knex';

// Reconstructed from the production schema (pg_dump): the original source of
// this migration was lost, so fresh installs had no appraisal tables at all.
// IF NOT EXISTS keeps it a no-op on databases that already have them.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS appraisal_templates (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      name varchar(200) NOT NULL,
      year integer,
      is_active boolean DEFAULT true,
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appraisal_categories (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      template_id uuid NOT NULL
        CONSTRAINT appraisal_categories_template_id_foreign REFERENCES appraisal_templates(id) ON DELETE CASCADE,
      name varchar(200) NOT NULL,
      max_score numeric(8,2) NOT NULL,
      weight numeric(5,2),
      order_index integer DEFAULT 0,
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appraisal_items (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      category_id uuid NOT NULL
        CONSTRAINT appraisal_items_category_id_foreign REFERENCES appraisal_categories(id) ON DELETE CASCADE,
      name varchar(300) NOT NULL,
      max_score numeric(8,2) NOT NULL,
      order_index integer DEFAULT 0,
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS staff_appraisals (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      staff_id uuid NOT NULL
        CONSTRAINT staff_appraisals_staff_id_foreign REFERENCES employees(id) ON DELETE CASCADE,
      template_id uuid NOT NULL
        CONSTRAINT staff_appraisals_template_id_foreign REFERENCES appraisal_templates(id) ON DELETE RESTRICT,
      year integer NOT NULL,
      annual_average numeric(5,2),
      annual_category varchar(50),
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT staff_appraisals_staff_id_year_unique UNIQUE (staff_id, year)
    );

    CREATE TABLE IF NOT EXISTS staff_appraisal_terms (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      appraisal_id uuid NOT NULL
        CONSTRAINT staff_appraisal_terms_appraisal_id_foreign REFERENCES staff_appraisals(id) ON DELETE CASCADE,
      term text NOT NULL CONSTRAINT staff_appraisal_terms_term_check CHECK (term IN ('I', 'II', 'III')),
      term_score numeric(5,2),
      ranking varchar(50),
      category varchar(50),
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT staff_appraisal_terms_appraisal_id_term_unique UNIQUE (appraisal_id, term)
    );

    CREATE TABLE IF NOT EXISTS staff_appraisal_scores (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      appraisal_term_id uuid NOT NULL
        CONSTRAINT staff_appraisal_scores_appraisal_term_id_foreign REFERENCES staff_appraisal_terms(id) ON DELETE CASCADE,
      category_id uuid NOT NULL
        CONSTRAINT staff_appraisal_scores_category_id_foreign REFERENCES appraisal_categories(id) ON DELETE CASCADE,
      item_id uuid
        CONSTRAINT staff_appraisal_scores_item_id_foreign REFERENCES appraisal_items(id) ON DELETE CASCADE,
      score numeric(8,2) NOT NULL,
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS staff_appraisal_comments (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      appraisal_id uuid NOT NULL
        CONSTRAINT staff_appraisal_comments_appraisal_id_foreign REFERENCES staff_appraisals(id) ON DELETE CASCADE,
      guidance_comment text,
      other_observations text,
      prepared_by varchar(200),
      approved_by varchar(200),
      teacher_acknowledgement varchar(200),
      created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT staff_appraisal_comments_appraisal_id_unique UNIQUE (appraisal_id)
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TABLE IF EXISTS staff_appraisal_comments;
    DROP TABLE IF EXISTS staff_appraisal_scores;
    DROP TABLE IF EXISTS staff_appraisal_terms;
    DROP TABLE IF EXISTS staff_appraisals;
    DROP TABLE IF EXISTS appraisal_items;
    DROP TABLE IF EXISTS appraisal_categories;
    DROP TABLE IF EXISTS appraisal_templates;
  `);
}
