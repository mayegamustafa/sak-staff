import knex from 'knex';
import { buildConnection, pool } from './connection';

const db = knex({
  client: 'pg',
  connection: buildConnection(),
  pool,
  migrations: {
    tableName: 'knex_migrations',
    directory: './migrations',
  },
  seeds: {
    directory: './seeds',
  },
});

export default db;
