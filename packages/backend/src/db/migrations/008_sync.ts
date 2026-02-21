import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Sync queue – tracks changes pushed from devices
  await knex.schema.createTable('sync_queue', (t) => {
    t.uuid('id').primary();
    t.string('table_name', 100).notNullable();
    t.uuid('record_id').notNullable();
    t.enum('operation', ['create', 'update', 'delete']).notNullable();
    t.jsonb('payload').notNullable();
    t.string('device_id', 100).notNullable();
    t.enum('status', ['pending', 'synced', 'conflict', 'error']).defaultTo('pending');
    t.integer('attempts').defaultTo(0);
    t.text('last_error').nullable();
    t.timestamp('synced_at').nullable();
    t.timestamps(true, true);
  });

  // Device registry
  await knex.schema.createTable('devices', (t) => {
    t.string('id', 100).primary();   // device UUID (generated on first install)
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('device_name', 200);
    t.string('platform', 50);        // 'electron' | 'android' | 'ios'
    t.timestamp('last_sync_at').nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('devices');
  await knex.schema.dropTableIfExists('sync_queue');
}
