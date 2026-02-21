// ─────────────────────────────────────────────
//  Sync Engine Types
// ─────────────────────────────────────────────

export type SyncStatus = 'pending' | 'synced' | 'conflict' | 'error';
export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncTable =
  | 'employees'
  | 'emergency_contacts'
  | 'education_records'
  | 'certifications'
  | 'employments'
  | 'salary_records'
  | 'transfers'
  | 'appraisals'
  | 'kpis'
  | 'trainings'
  | 'documents';

export interface SyncQueueItem {
  id: string;                  // local UUID
  table: SyncTable;
  recordId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  status: SyncStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  syncedAt?: string;
}

export interface SyncBatchRequest {
  deviceId: string;
  lastSyncAt: string;          // ISO — server returns only records changed after this
  items: SyncQueueItem[];
}

export interface SyncBatchResponse {
  serverTimestamp: string;
  accepted: string[];          // recordIds accepted
  rejected: { id: string; reason: string }[];
  serverUpdates: Record<SyncTable, unknown[]>;
}

export interface SyncMeta {
  deviceId: string;
  lastSyncAt: string;
  isOnline: boolean;
  pendingCount: number;
}
