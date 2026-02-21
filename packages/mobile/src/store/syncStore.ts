import { create } from 'zustand';
import { MobileSyncService } from '../sync/MobileSyncService';

interface SyncState {
  isSyncing: boolean;
  lastSyncAt: string | null;
  error: string | null;
  triggerSync: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set) => ({
  isSyncing: false,
  lastSyncAt: null,
  error: null,

  triggerSync: async () => {
    set({ isSyncing: true, error: null });
    try {
      await MobileSyncService.sync();
      set({ lastSyncAt: new Date().toISOString() });
    } catch (e: any) {
      set({ error: e?.message ?? 'Sync failed' });
    } finally {
      set({ isSyncing: false });
    }
  },
}));
