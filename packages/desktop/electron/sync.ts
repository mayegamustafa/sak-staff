import axios, { AxiosInstance } from 'axios';
import { getDatabase } from './database';
import { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';

export class SyncService {
  private api: AxiosInstance;
  private deviceId: string;
  private isSyncing = false;

  constructor(serverUrl: string, accessToken: string) {
    this.api = axios.create({ baseURL: serverUrl, timeout: 30_000 });
    this.api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

    // Stable device ID stored in sync_meta
    const db = getDatabase();
    const row = db.prepare('SELECT value FROM sync_meta WHERE key = ?').get('device_id') as { value: string } | undefined;
    if (row) {
      this.deviceId = row.value;
    } else {
      this.deviceId = uuidv4();
      db.prepare('INSERT INTO sync_meta (key, value) VALUES (?, ?)').run('device_id', this.deviceId);
    }
  }

  private notify(status: object) {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('sync:statusUpdate', status);
    });
  }

  async syncNow(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.notify({ status: 'syncing', pendingCount: this.getPendingCount() });

    const db = getDatabase();

    try {
      // Get last sync timestamp
      const lastSyncRow = db.prepare('SELECT value FROM sync_meta WHERE key = ?').get('last_sync_at') as { value: string } | undefined;
      const lastSyncAt = lastSyncRow?.value || new Date(0).toISOString();

      // Get pending queue items
      const pending = db.prepare(
        "SELECT * FROM sync_queue WHERE status = 'pending' LIMIT 100"
      ).all() as Array<{ id: string; table_name: string; record_id: string; operation: string; payload: string }>;

      const items = pending.map((p) => ({
        id: p.id,
        table: p.table_name,
        recordId: p.record_id,
        operation: p.operation as 'create' | 'update' | 'delete',
        payload: JSON.parse(p.payload),
      }));

      const { data } = await this.api.post('/api/sync', {
        deviceId: this.deviceId,
        lastSyncAt,
        items,
      });

      // Mark accepted as synced
      const markSynced = db.prepare(
        "UPDATE sync_queue SET status = 'synced', synced_at = datetime('now') WHERE id = ?"
      );
      for (const id of data.accepted) markSynced.run(id);

      // Mark rejected as error
      const markError = db.prepare(
        "UPDATE sync_queue SET status = 'error', last_error = ?, attempts = attempts + 1 WHERE id = ?"
      );
      for (const r of data.rejected) markError.run(r.reason, r.id);

      // Apply server updates to local mirror
      this.applyServerUpdates(db, data.serverUpdates);

      // Update last sync timestamp
      db.prepare(`
        INSERT INTO sync_meta (key, value) VALUES ('last_sync_at', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(data.serverTimestamp);

      this.notify({ status: 'synced', lastSyncAt: data.serverTimestamp, pendingCount: 0 });
    } catch (err) {
      this.notify({ status: 'error', message: (err as Error).message, pendingCount: this.getPendingCount() });
    } finally {
      this.isSyncing = false;
    }
  }

  private applyServerUpdates(db: ReturnType<typeof getDatabase>, updates: Record<string, unknown[]>): void {
    const tableMap: Record<string, string> = {
      employees: `INSERT INTO employees (id, staff_no, first_name, middle_name, last_name, gender,
                  date_of_birth, nationality, national_id, phone, email, is_active, updated_at, synced_at)
                  VALUES (@id, @staff_no, @first_name, @middle_name, @last_name, @gender,
                  @date_of_birth, @nationality, @national_id, @phone, @email, @is_active,
                  @updated_at, datetime('now'))
                  ON CONFLICT(id) DO UPDATE SET
                    first_name = excluded.first_name, last_name = excluded.last_name,
                    phone = excluded.phone, email = excluded.email,
                    is_active = excluded.is_active, updated_at = excluded.updated_at,
                    synced_at = datetime('now')`,
    };

    for (const [table, sql] of Object.entries(tableMap)) {
      const rows = updates[table] as Record<string, unknown>[] | undefined;
      if (!rows?.length) continue;
      const stmt = db.prepare(sql);
      const insertMany = db.transaction((items: Record<string, unknown>[]) => {
        for (const item of items) stmt.run(item);
      });
      insertMany(rows);
    }
  }

  private getPendingCount(): number {
    const db = getDatabase();
    const row = db.prepare("SELECT COUNT(*) as c FROM sync_queue WHERE status = 'pending'").get() as { c: number };
    return row.c;
  }

  getStatus() {
    return {
      deviceId: this.deviceId,
      pendingCount: this.getPendingCount(),
      isSyncing: this.isSyncing,
      lastSyncAt: (getDatabase().prepare('SELECT value FROM sync_meta WHERE key = ?').get('last_sync_at') as { value: string } | undefined)?.value,
    };
  }
}
