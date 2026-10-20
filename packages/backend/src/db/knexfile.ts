import type { Knex } from 'knex';
import dotenv from 'dotenv';
import path from 'path';
import { buildConnection, pool } from './connection';

// Load .env from backend root (two levels up from src/db/)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection: buildConnection(),
    migrations: {
      directory: path.resolve(__dirname, 'migrations'),
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
    seeds: {
      directory: path.resolve(__dirname, 'seeds'),
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
  },

  production: {
    client: 'pg',
    // buildConnection() decides on TLS from DB_SSL / the host (see connection.ts)
    connection: buildConnection(),
    migrations: {
      // IMPORTANT: migrations run from the TypeScript sources via ts-node in
      // every environment, including production.
      //
      // knex tracks applied migrations by filename, and the existing database
      // has all of them recorded with a .ts extension. Pointing production at
      // the compiled dist/*.js copies would make knex treat all 36 as new and
      // re-run them against a populated database. Keep this as .ts.
      directory: path.resolve(__dirname, 'migrations'),
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
    seeds: {
      directory: path.resolve(__dirname, 'seeds'),
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
    pool,
  },
};

// Knex CLI expects a default export
module.exports = config[process.env.NODE_ENV || 'development'];
