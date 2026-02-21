import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

let db: Database.Database;

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialised. Call initDatabase() first.');
  return db;
}

export async function initDatabase(): Promise<void> {
  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'sak-staff');
  fs.mkdirSync(dbDir, { recursive: true });

  const dbPath = path.join(dbDir, 'sak-staff.db');
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createLocalSchema();
  console.log(`[SQLite] Database ready at ${dbPath}`);
}

function createLocalSchema(): void {
  db.exec(`
    -- Auth / session
    CREATE TABLE IF NOT EXISTS local_session (
      id INTEGER PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      role_slug TEXT NOT NULL,
      permissions TEXT NOT NULL,  -- JSON array
      access_token TEXT,
      refresh_token TEXT,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Sync metadata
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Sync queue (outbox)
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL,  -- 'create'|'update'|'delete'
      payload TEXT NOT NULL,    -- JSON
      status TEXT DEFAULT 'pending',
      attempts INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      synced_at TEXT
    );

    -- Employees (local mirror)
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      staff_no TEXT NOT NULL,
      first_name TEXT NOT NULL,
      middle_name TEXT,
      last_name TEXT NOT NULL,
      gender TEXT,
      date_of_birth TEXT,
      nationality TEXT,
      national_id TEXT,
      passport_no TEXT,
      marital_status TEXT,
      phone TEXT,
      phone2 TEXT,
      email TEXT,
      residential_address TEXT,
      photo_path TEXT,
      is_active INTEGER DEFAULT 1,
      updated_at TEXT,
      synced_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_employees_staff_no ON employees(staff_no);
    CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(last_name, first_name);

    -- Employments
    CREATE TABLE IF NOT EXISTS employments (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      campus_id TEXT NOT NULL,
      department_id TEXT NOT NULL,
      job_title TEXT NOT NULL,
      pay_grade TEXT,
      contract_type TEXT,
      status TEXT DEFAULT 'active',
      start_date TEXT,
      end_date TEXT,
      updated_at TEXT,
      synced_at TEXT,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    );

    -- Transfers
    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      from_campus_id TEXT,
      to_campus_id TEXT,
      from_job_title TEXT,
      to_job_title TEXT,
      effective_date TEXT,
      reason TEXT,
      updated_at TEXT,
      synced_at TEXT,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    );

    -- Appraisals
    CREATE TABLE IF NOT EXISTS appraisals (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      supervisor_id TEXT NOT NULL,
      period TEXT,
      academic_year TEXT,
      conducted_date TEXT,
      overall_score REAL,
      overall_rating TEXT,
      supervisor_comments TEXT,
      is_eligible_for_promotion INTEGER DEFAULT 0,
      updated_at TEXT,
      synced_at TEXT,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    );

    -- Trainings
    CREATE TABLE IF NOT EXISTS trainings (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT,
      provider TEXT,
      start_date TEXT,
      end_date TEXT,
      duration_days INTEGER,
      skills TEXT,  -- JSON array
      updated_at TEXT,
      synced_at TEXT,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    );

    -- Campuses (lookup)
    CREATE TABLE IF NOT EXISTS campuses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );

    -- Departments (lookup)
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      campus_id TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );
  `);
}
