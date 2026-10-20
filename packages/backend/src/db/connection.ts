import type { Knex } from 'knex';

/**
 * Postgres connection settings, shared by the runtime client (db/index.ts) and
 * the knex CLI (knexfile.ts).
 *
 * Deliberately reads process.env directly instead of importing ../config: the
 * knex CLI runs migrations in contexts (build steps, one-off containers) where
 * app secrets like JWT_SECRET are not present, and it should not fail there.
 *
 * Two shapes are supported so one build runs anywhere:
 *   DATABASE_URL=postgres://user:pass@host:5432/db   (Railway, Render, Neon, Fly)
 *   DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD   (self-hosted)
 */

function sslEnabled(host: string): boolean {
  const setting = (process.env.DB_SSL || 'auto').toLowerCase();
  if (setting === 'true'  || setting === '1') return true;
  if (setting === 'false' || setting === '0') return false;
  if (!host) return false;
  return !(
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.internal') ||
    host.endsWith('.local')
  );
}

export function buildConnection(): Knex.PgConnectionConfig | string {
  const url = process.env.DATABASE_URL;

  if (url) {
    let host = '';
    try { host = new URL(url).hostname; } catch { /* leave blank → no ssl */ }
    return {
      connectionString: url,
      ...(sslEnabled(host) ? { ssl: { rejectUnauthorized: false } } : {}),
    } as Knex.PgConnectionConfig;
  }

  const host = process.env.DB_HOST || 'localhost';
  return {
    host,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'sak_staff',
    user: process.env.DB_USER || 'sak_admin',
    password: process.env.DB_PASSWORD || '',
    ...(sslEnabled(host) ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

export const pool = {
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
};
