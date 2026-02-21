import axios from 'axios';
import { getDb } from '../database';
import NetInfo from '@react-native-community/netinfo';

export class MobileSyncService {
  private serverUrl: string;
  private token: string;
  private deviceId: string;

  constructor(serverUrl: string, token: string, deviceId: string) {
    this.serverUrl = serverUrl;
    this.token = token;
    this.deviceId = deviceId;
  }

  async syncIfOnline(): Promise<void> {
    const state = await NetInfo.fetch();
    if (!state.isConnected) return;
    await this.sync();
  }

  async sync(): Promise<void> {
    const db = await getDb();

    const metaRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM sync_meta WHERE key = 'last_sync_at'"
    );
    const lastSyncAt = metaRow?.value || new Date(0).toISOString();

    const pending = await db.getAllAsync<{
      id: string; table_name: string; record_id: string; operation: string; payload: string;
    }>("SELECT * FROM sync_queue WHERE status = 'pending' LIMIT 50");

    const items = pending.map((p) => ({
      id: p.id,
      table: p.table_name,
      recordId: p.record_id,
      operation: p.operation,
      payload: JSON.parse(p.payload),
    }));

    const { data } = await axios.post(
      `${this.serverUrl}/api/sync`,
      { deviceId: this.deviceId, lastSyncAt, items },
      { headers: { Authorization: `Bearer ${this.token}` } }
    );

    // Mark accepted / rejected
    for (const id of data.accepted) {
      await db.runAsync(
        "UPDATE sync_queue SET status = 'synced', synced_at = datetime('now') WHERE id = ?",
        [id]
      );
    }

    // Mirror server employee updates locally
    const updates = data.serverUpdates?.employees as {
      id: string; staff_no: string; first_name: string; last_name: string;
      phone: string; email: string; is_active: number; updated_at: string;
    }[] | undefined;

    if (updates?.length) {
      for (const e of updates) {
        await db.runAsync(`
          INSERT INTO employees (id, staff_no, first_name, last_name, phone, email, is_active, updated_at, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            first_name = excluded.first_name, last_name = excluded.last_name,
            phone = excluded.phone, email = excluded.email,
            is_active = excluded.is_active, updated_at = excluded.updated_at
        `, [e.id, e.staff_no, e.first_name, e.last_name, e.phone, e.email, e.is_active, e.updated_at]);
      }
    }

    // Save last sync timestamp
    await db.runAsync(`
      INSERT INTO sync_meta (key, value) VALUES ('last_sync_at', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `, [data.serverTimestamp]);
  }
}
