import type { Knex } from 'knex';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from backend root (two levels up from src/db/)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connection = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'sak_staff',
  user: process.env.DB_USER || 'sak_admin',
  password: process.env.DB_PASSWORD || '',
};

const config: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection,
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
    connection: {
      ...connection,
      ssl: { rejectUnauthorized: false },
    },
    migrations: {
      directory: path.resolve(__dirname, '../dist/db/migrations'),
    },
    seeds: {
      directory: path.resolve(__dirname, '../dist/db/seeds'),
    },
    pool: { min: 2, max: 10 },
  },
};

// Knex CLI expects a default export
module.exports = config[process.env.NODE_ENV || 'development'];
