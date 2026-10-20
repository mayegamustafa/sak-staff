import { ipcMain, shell, dialog, app as electronApp } from 'electron';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
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

function setMustChangePassword(db: ReturnType<typeof getDatabase>, value: boolean): void {
  db.prepare(`
    INSERT INTO sync_meta (key, value) VALUES ('must_change_password', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(value ? '1' : '0');
}

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
      setMustChangePassword(db, !!data.mustChangePassword);

      return { success: true, user: data.user, permissions: data.user.permissions, mustChangePassword: !!data.mustChangePassword };
    } catch (err) {
      const msg = axios.isAxiosError(err) ? (err.response?.data?.message || 'Server error') : (err as Error).message;
      return { success: false, message: msg };
    }
  });

  ipcMain.handle('auth:getSession', async () => {
    const db = getDatabase();
    const session = db.prepare("SELECT * FROM local_session ORDER BY id DESC LIMIT 1").get() as Record<string, unknown> | undefined;
    if (!session) return null;

    // Restore the in-memory token so IPC handlers can make authenticated API calls
    // after an app reload (without requiring the user to log in again).
    if (session['access_token'] && !currentToken) {
      currentToken = session['access_token'] as string;
      currentRefreshToken = (session['refresh_token'] as string) ?? null;
      if (!syncService) {
        syncService = new SyncService(SERVER_URL, currentToken);
      }
    }

    const mcp = db.prepare('SELECT value FROM sync_meta WHERE key = ?').get('must_change_password') as { value: string } | undefined;
    return {
      userId: session['user_id'],
      username: session['username'],
      roleSlug: session['role_slug'],
      permissions: JSON.parse(session['permissions'] as string),
      mustChangePassword: mcp?.value === '1',
    };
  });

  ipcMain.handle('auth:changePassword', async (_evt, { currentPassword, newPassword }) => {
    const db = getDatabase();
    try {
      const { data } = await api().post('/api/auth/change-password', { currentPassword, newPassword });
      // The server revoked the old tokens; switch to the new pair.
      currentToken = data.accessToken;
      currentRefreshToken = data.refreshToken;
      syncService = new SyncService(SERVER_URL, currentToken!);
      db.prepare('UPDATE local_session SET access_token = ?, refresh_token = ?, permissions = ?')
        .run(data.accessToken, data.refreshToken, JSON.stringify(data.user.permissions));
      setMustChangePassword(db, false);
      return { success: true };
    } catch (err) {
      const msg = axios.isAxiosError(err) ? (err.response?.data?.message || 'Server error') : (err as Error).message;
      return { success: false, message: msg };
    }
  });

  ipcMain.handle('auth:logout', () => {
    const db = getDatabase();
    db.prepare('DELETE FROM local_session').run();
    setMustChangePassword(db, false);
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

  ipcMain.handle('employees:getBankDetails', async (_evt, id: string) => {
    try { return (await api().get(`/api/employees/${id}/bank-details`)).data; }
    catch { return []; }
  });

  ipcMain.handle('employees:getClasses', async (_evt, id: string) => {
    try { return (await api().get(`/api/employees/${id}/classes`)).data; }
    catch { return []; }
  });

  ipcMain.handle('employees:updateClasses', async (_evt, id: string, classIds: string[]) => {
    try { return (await api().put(`/api/employees/${id}/classes`, { classIds })).data; }
    catch (e: any) { return { success: false, message: e?.message }; }
  });

  ipcMain.handle('classes:list', async (_evt, params?: Record<string, unknown>) => {
    try {
      const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
      return (await api().get(`/api/classes${qs}`)).data;
    }
    catch { return []; }
  });

  ipcMain.handle('employees:addEmergency', async (_evt, employeeId: string, data: unknown) => {
    try { return (await api().post(`/api/employees/${employeeId}/emergency-contacts`, data)).data; }
    catch (e: any) { return { success: false, message: e?.message }; }
  });

  ipcMain.handle('employees:updateEmergency', async (_evt, employeeId: string, contactId: string, data: unknown) => {
    try { return (await api().put(`/api/employees/${employeeId}/emergency-contacts/${contactId}`, data)).data; }
    catch (e: any) { return { success: false, message: e?.message }; }
  });

  ipcMain.handle('employees:deactivate', async (_evt, id: string, exitDate: string) => {
    try { return (await api().post(`/api/employees/${id}/deactivate`, { exitDate })).data; }
    catch (e: any) { return { success: false, message: e?.message }; }
  });

  ipcMain.handle('employees:reactivate', async (_evt, id: string) => {
    try { return (await api().post(`/api/employees/${id}/reactivate`)).data; }
    catch (e: any) { return { success: false, message: e?.message }; }
  });

  // ── Bulk Import ───────────────────────────────────────────────────────
  ipcMain.handle('employees:bulkImportTemplate', async () => {
    try {
      const res = await api().get('/api/employees/bulk-import/template', { responseType: 'arraybuffer' });
      return { ok: true, data: Buffer.from(res.data) };
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data ? String(err.response.data) : err?.message ?? 'Unknown error';
      return { ok: false, status, error: msg };
    }
  });

  ipcMain.handle('employees:bulkImportPreview', async (_evt, fileBuffer: ArrayBuffer) => {
    try {
      const FormData = require('form-data');
      const form = new FormData();
      form.append('file', Buffer.from(fileBuffer), { filename: 'import.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const res = await api().post('/api/employees/bulk-import/preview', form, { headers: form.getHeaders() });
      return res.data;
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Preview failed';
      throw new Error(msg);
    }
  });

  ipcMain.handle('employees:bulkImportConfirm', async (_evt, rows: unknown[]) => {
    return (await api().post('/api/employees/bulk-import/confirm', { rows })).data;
  });

  // ── Onboarding links (admin) ──────────────────────────────────────────
  ipcMain.handle('onboarding:generateLink', async (_evt, campusId: string, label?: string) => {
    return (await api().post('/api/onboarding/admin/generate-link', { campus_id: campusId, label })).data;
  });

  ipcMain.handle('onboarding:listTokens', async () => {
    return (await api().get('/api/onboarding/admin/tokens')).data;
  });

  ipcMain.handle('onboarding:revokeToken', async (_evt, id: string) => {
    await api().delete(`/api/onboarding/admin/tokens/${id}`);
    return { success: true };
  });

  // ── Server info (for building onboarding URLs) ────────────────────────
  ipcMain.handle('server:info', async () => {
    try { return (await api().get('/api/server-info')).data; }
    catch { return { ip: 'localhost', port: 4000, baseUrl: 'http://localhost:4000' }; }
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

  ipcMain.handle('transfers:update', async (_evt, id: string, payload) => {
    const { data } = await api().put(`/api/transfers/${id}`, payload);
    return { success: true, data };
  });

  ipcMain.handle('transfers:approve', async (_evt, id: string, action: string, meta: Record<string, unknown> = {}) => {
    const { data } = await api().patch(`/api/transfers/${id}/approve`, { action, ...meta });
    return { success: true, data };
  });

  ipcMain.handle('transfers:cancel', async (_evt, id: string) => {
    const { data } = await api().patch(`/api/transfers/${id}/cancel`);
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

  // Fetch a document's bytes. Documents are permission-gated on the server, so
  // the renderer cannot request them directly – it has no bearer token.
  ipcMain.handle('documents:file', async (_evt, id: string) => {
    try {
      const res = await api().get(`/api/documents/${id}/file`, { responseType: 'arraybuffer' });
      return {
        ok: true,
        data: Buffer.from(res.data),
        mimeType: String(res.headers['content-type'] ?? 'application/octet-stream'),
      };
    } catch (err: any) {
      const status = err?.response?.status;
      return { ok: false, status, error: err?.message ?? 'Unknown error' };
    }
  });

  // Open a document in the OS default viewer. The renderer has no bearer token,
  // so the bytes are fetched here, written to a temp file and handed to the OS.
  ipcMain.handle('documents:openFile', async (_evt, id: string) => {
    try {
      const res = await api().get(`/api/documents/${id}/file`, { responseType: 'arraybuffer' });
      const disposition = String(res.headers['content-disposition'] ?? '');
      const ext = path.extname(decodeURIComponent(disposition.split("filename*=UTF-8''")[1] ?? '')) || '.bin';
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sak-doc-'));
      const file = path.join(dir, `document${ext}`);
      fs.writeFileSync(file, Buffer.from(res.data));
      const error = await shell.openPath(file);
      return error ? { success: false, message: error } : { success: true };
    } catch (err: any) {
      return { success: false, message: err?.response?.status === 403
        ? 'You do not have permission to view this document'
        : err?.message ?? 'Could not open document' };
    }
  });

  // Save a document to a location the user picks.
  ipcMain.handle('documents:downloadFile', async (_evt, id: string, filename: string) => {
    try {
      const res = await api().get(`/api/documents/${id}/file?download=1`, { responseType: 'arraybuffer' });
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: path.join(electronApp.getPath('downloads'), filename),
      });
      if (canceled || !filePath) return { success: false, canceled: true };
      fs.writeFileSync(filePath, Buffer.from(res.data));
      return { success: true, path: filePath };
    } catch (err: any) {
      return { success: false, message: err?.response?.status === 403
        ? 'You do not have permission to download this document'
        : err?.message ?? 'Could not save document' };
    }
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
