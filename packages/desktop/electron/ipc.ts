import { ipcMain } from 'electron';
import axios from 'axios';
import { getDatabase } from './database';
import { SyncService } from './sync';

// Server URL (configurable later via settings)
const SERVER_URL = process.env.SAK_SERVER_URL || 'http://localhost:4000';

let syncService: SyncService | null = null;
let currentToken: string | null = null;
let currentRefreshToken: string | null = null;

const api = () => {
  const instance = axios.create({ baseURL: SERVER_URL, timeout: 15_000 });
  if (currentToken) instance.defaults.headers.common['Authorization'] = `Bearer ${currentToken}`;
  return instance;
};

export function registerIpcHandlers(): void {
  // ── Auth ────────────────────────────────────────────────────────────────
  ipcMain.handle('auth:login', async (_evt, { username, password }) => {
    const db = getDatabase();
    try {
      const { data } = await api().post('/api/auth/login', { username, password });
      currentToken = data.accessToken;
      currentRefreshToken = data.refreshToken;
      syncService = new SyncService(SERVER_URL, currentToken!);

      // Store session locally
      db.prepare('DELETE FROM local_session').run();
      db.prepare(`
        INSERT INTO local_session (user_id, username, role_slug, permissions, access_token, refresh_token, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))
      `).run(
        data.user.id, data.user.username, data.user.role.slug,
        JSON.stringify(data.user.permissions), data.accessToken, data.refreshToken
      );

      return { success: true, user: data.user, permissions: data.user.permissions };
    } catch (err) {
      const msg = axios.isAxiosError(err) ? (err.response?.data?.message || 'Server error') : (err as Error).message;
      return { success: false, message: msg };
    }
  });

  ipcMain.handle('auth:getSession', async () => {
    const db = getDatabase();
    const session = db.prepare("SELECT * FROM local_session ORDER BY id DESC LIMIT 1").get() as Record<string, unknown> | undefined;
    if (!session) return null;
    return {
      userId: session['user_id'],
      username: session['username'],
      roleSlug: session['role_slug'],
      permissions: JSON.parse(session['permissions'] as string),
    };
  });

  ipcMain.handle('auth:logout', () => {
    const db = getDatabase();
    db.prepare('DELETE FROM local_session').run();
    currentToken = null;
    currentRefreshToken = null;
    syncService = null;
  });

  // ── Employees ─────────────────────────────────────────────────────────
  ipcMain.handle('employees:list', async (_evt, params = {}) => {
    const db = getDatabase();
    try {
      // Try server first; fallback to local SQLite
      if (currentToken) {
        const { data } = await api().get('/api/employees', { params });
        return data;
      }
    } catch { /* offline – use local */ }
    const search = params.search || '';
    return db.prepare(
      `SELECT * FROM employees WHERE is_active = 1 AND (
         first_name LIKE ? OR last_name LIKE ? OR staff_no LIKE ?
       ) ORDER BY last_name LIMIT 50`
    ).all(`%${search}%`, `%${search}%`, `%${search}%`);
  });

  ipcMain.handle('employees:get', async (_evt, id: string) => {
    const db = getDatabase();
    try {
      if (currentToken) {
        const { data } = await api().get(`/api/employees/${id}`);
        return data;
      }
    } catch { /* offline */ }
    return db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  });

  ipcMain.handle('employees:create', async (_evt, payload) => {
    try {
      const { data } = await api().post('/api/employees', payload);
      // Mirror locally
      const db = getDatabase();
      db.prepare(`
        INSERT OR REPLACE INTO employees (id, staff_no, first_name, middle_name, last_name,
          gender, date_of_birth, nationality, national_id, phone, email, is_active, updated_at)
        VALUES (@id, @staff_no, @first_name, @middle_name, @last_name, @gender,
          @date_of_birth, @nationality, @national_id, @phone, @email, @is_active, @updated_at)
      `).run(data);
      return { success: true, data };
    } catch (err) {
      // Queue for sync
      const db = getDatabase();
      const { v4: uuidv4 } = await import('uuid');
      const id = uuidv4();
      db.prepare(`
        INSERT INTO sync_queue (id, table_name, record_id, operation, payload)
        VALUES (?, 'employees', ?, 'create', ?)
      `).run(uuidv4(), id, JSON.stringify({ ...payload, id }));
      db.prepare(`INSERT OR REPLACE INTO employees (id, staff_no, first_name, last_name, phone, is_active)
        VALUES (@id, @staffNo, @firstName, @lastName, @phone, 1)`
      ).run({ ...payload });
      return { success: true, offline: true };
    }
  });

  ipcMain.handle('employees:update', async (_evt, id: string, payload) => {
    try {
      const { data } = await api().put(`/api/employees/${id}`, payload);
      return { success: true, data };
    } catch {
      const db = getDatabase();
      const { v4: uuidv4 } = await import('uuid');
      db.prepare(`INSERT INTO sync_queue (id, table_name, record_id, operation, payload)
        VALUES (?, 'employees', ?, 'update', ?)`).run(uuidv4(), id, JSON.stringify(payload));
      return { success: true, offline: true };
    }
  });

  ipcMain.handle('employees:delete', async (_evt, id: string) => {
    try {
      await api().delete(`/api/employees/${id}`);
      getDatabase().prepare("UPDATE employees SET is_active = 0 WHERE id = ?").run(id);
      return { success: true };
    } catch {
      return { success: false, message: 'Could not delete. Check connection.' };
    }
  });

  // ── Employment ────────────────────────────────────────────────────────
  ipcMain.handle('employment:getByEmployee', async (_evt, employeeId: string) => {
    try { return (await api().get(`/api/employment/${employeeId}`)).data; }
    catch {
      return getDatabase().prepare('SELECT * FROM employments WHERE employee_id = ?').all(employeeId);
    }
  });

  ipcMain.handle('employment:create', async (_evt, payload) => {
    const { data } = await api().post('/api/employment', payload);
    return { success: true, data };
  });

  ipcMain.handle('employment:addSalary', async (_evt, employmentId: string, payload) => {
    const { data } = await api().post(`/api/employment/${employmentId}/salary`, payload);
    return { success: true, data };
  });

  // ── Transfers ─────────────────────────────────────────────────────────
  ipcMain.handle('transfers:list', async (_evt, params = {}) => {
    try { return (await api().get('/api/transfers', { params })).data; }
    catch {
      return getDatabase().prepare('SELECT * FROM transfers ORDER BY effective_date DESC LIMIT 50').all();
    }
  });

  ipcMain.handle('transfers:create', async (_evt, payload) => {
    const { data } = await api().post('/api/transfers', payload);
    return { success: true, data };
  });

  ipcMain.handle('transfers:approve', async (_evt, id: string, action: string) => {
    const { data } = await api().patch(`/api/transfers/${id}/approve`, { action });
    return { success: true, data };
  });

  // ── Performance ───────────────────────────────────────────────────────
  ipcMain.handle('performance:list', async (_evt, params = {}) => {
    try { return (await api().get('/api/performance', { params })).data; }
    catch {
      return getDatabase().prepare('SELECT * FROM appraisals ORDER BY conducted_date DESC LIMIT 50').all();
    }
  });

  ipcMain.handle('performance:get', async (_evt, id: string) => {
    return (await api().get(`/api/performance/${id}`)).data;
  });

  ipcMain.handle('performance:create', async (_evt, payload) => {
    const { data } = await api().post('/api/performance', payload);
    return { success: true, data };
  });

  // ── Training ──────────────────────────────────────────────────────────
  ipcMain.handle('training:list', async (_evt, params = {}) => {
    try { return (await api().get('/api/training', { params })).data; }
    catch {
      return getDatabase().prepare('SELECT * FROM trainings ORDER BY start_date DESC LIMIT 50').all();
    }
  });

  ipcMain.handle('training:create', async (_evt, payload) => {
    const { data } = await api().post('/api/training', payload);
    return { success: true, data };
  });

  ipcMain.handle('training:update', async (_evt, id: string, payload) => {
    const { data } = await api().put(`/api/training/${id}`, payload);
    return { success: true, data };
  });

  ipcMain.handle('training:delete', async (_evt, id: string) => {
    await api().delete(`/api/training/${id}`);
    return { success: true };
  });

  // ── Documents ─────────────────────────────────────────────────────────
  ipcMain.handle('documents:list', async (_evt, params = {}) => {
    return (await api().get('/api/documents', { params })).data;
  });

  ipcMain.handle('documents:delete', async (_evt, id: string) => {
    await api().delete(`/api/documents/${id}`);
    return { success: true };
  });

  // ── Reports ───────────────────────────────────────────────────────────
  ipcMain.handle('reports:summary', async () => (await api().get('/api/reports/summary')).data);
  ipcMain.handle('reports:staffPerCampus', async () => (await api().get('/api/reports/staff-per-campus')).data);
  ipcMain.handle('reports:transfersHistory', async (_evt, year) =>
    (await api().get('/api/reports/transfers-history', { params: { year } })).data
  );
  ipcMain.handle('reports:performanceRanking', async (_evt, academicYear) =>
    (await api().get('/api/reports/performance-ranking', { params: { academicYear } })).data
  );

  // ── Sync ──────────────────────────────────────────────────────────────
  ipcMain.handle('sync:trigger', async () => {
    if (!syncService) return { success: false, message: 'Not logged in' };
    await syncService.syncNow();
    return { success: true };
  });

  ipcMain.handle('sync:getStatus', () => {
    return syncService?.getStatus() ?? { pendingCount: 0, isSyncing: false };
  });
}
