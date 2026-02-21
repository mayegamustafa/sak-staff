import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://192.168.1.100:4000';

interface AuthState {
  user: { id: string; username: string; role: { slug: string; name: string } } | null;
  permissions: string[];
  token: string | null;
  isLoading: boolean;
  serverUrl: string;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  loadSession: () => Promise<void>;
  hasPermission: (module: string, action: string) => boolean;
  setServerUrl: (url: string) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  permissions: [],
  token: null,
  isLoading: false,
  serverUrl: SERVER_URL,

  login: async (username, password) => {
    set({ isLoading: true });
    try {
      const { data } = await axios.post(`${get().serverUrl}/api/auth/login`, { username, password });
      await SecureStore.setItemAsync('accessToken', data.accessToken);
      await SecureStore.setItemAsync('refreshToken', data.refreshToken);
      await SecureStore.setItemAsync('user', JSON.stringify(data.user));
      await SecureStore.setItemAsync('permissions', JSON.stringify(data.user.permissions));

      set({
        user: data.user,
        permissions: data.user.permissions,
        token: data.accessToken,
        isLoading: false,
      });
      return { success: true };
    } catch (err) {
      set({ isLoading: false });
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.message || 'Server error'
        : 'Network error';
      return { success: false, message: msg };
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    await SecureStore.deleteItemAsync('user');
    await SecureStore.deleteItemAsync('permissions');
    set({ user: null, token: null, permissions: [] });
  },

  loadSession: async () => {
    const token = await SecureStore.getItemAsync('accessToken');
    const userStr = await SecureStore.getItemAsync('user');
    const permsStr = await SecureStore.getItemAsync('permissions');
    if (token && userStr) {
      set({
        token,
        user: JSON.parse(userStr),
        permissions: permsStr ? JSON.parse(permsStr) : [],
      });
    }
  },

  hasPermission: (module, action) => {
    return get().permissions.includes(`${module}:${action}`);
  },

  setServerUrl: (url) => {
    set({ serverUrl: url });
  },
}));
