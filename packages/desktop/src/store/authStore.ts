import { create } from 'zustand';

interface AuthState {
  user: { id: string; username: string; email: string; role: { slug: string; name: string } } | null;
  permissions: string[];
  isLoading: boolean;
  /** Server requires a new password before anything else is allowed. */
  mustChangePassword: boolean;
  setMustChangePassword: (v: boolean) => void;
  setUser: (user: AuthState['user'], permissions: string[]) => void;
  logout: () => void;
  hasPermission: (module: string, action: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  permissions: [],
  isLoading: false,
  mustChangePassword: false,
  setMustChangePassword: (v) => set({ mustChangePassword: v }),

  setUser: (user, permissions) => set({ user, permissions }),

  logout: async () => {
    await window.sakAPI.auth.logout();
    set({ user: null, permissions: [], mustChangePassword: false });
  },

  hasPermission: (module, action) => {
    const { user, permissions } = get();
    // super_admin has unrestricted access
    if (user?.role?.slug === 'super_admin') return true;
    return permissions.includes(`${module}:${action}`);
  },
}));
