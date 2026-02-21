import { create } from 'zustand';

interface SyncStatus {
  status: 'idle' | 'syncing' | 'synced' | 'error' | 'offline';
  pendingCount: number;
  lastSyncAt?: string;
  message?: string;
}

interface SyncStore {
  syncStatus: SyncStatus;
  setSyncStatus: (s: Partial<SyncStatus>) => void;
  triggerSync: () => Promise<void>;
}

export const useSyncStore = create<SyncStore>((set) => ({
  syncStatus: { status: 'idle', pendingCount: 0 },

  setSyncStatus: (s) =>
    set((state) => ({ syncStatus: { ...state.syncStatus, ...s } })),

  triggerSync: async () => {
    set((state) => ({ syncStatus: { ...state.syncStatus, status: 'syncing' } }));
    try {
      const result = await window.sakAPI.sync.trigger() as any;
      if (result && !result.success) {
        set((state) => ({
          syncStatus: { ...state.syncStatus, status: 'error', message: result.message },
        }));
      } else {
        set((state) => ({ syncStatus: { ...state.syncStatus, status: 'synced', lastSyncAt: new Date().toISOString() } }));
      }
    } catch (err: any) {
      set((state) => ({
        syncStatus: { ...state.syncStatus, status: 'error', message: err?.message ?? 'Sync failed' },
      }));
    }
  },
}));
