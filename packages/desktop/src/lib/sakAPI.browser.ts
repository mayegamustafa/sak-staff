/**
 * Browser-mode shim for window.sakAPI.
 * Mirrors the Electron preload interface, using the REST API directly.
 * Injected in main.tsx when window.sakAPI is not already set by Electron.
 */
import axios from 'axios';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string) ?? 'http://localhost:4000';

const TOKEN_KEY = 'sak_token';
const USER_KEY  = 'sak_user';
const PERMS_KEY = 'sak_permissions';

// In Vite dev mode use a relative base URL so all /api/* requests go through
// Vite's built-in proxy → no CORS headers needed.
// In production (static build) use the full server URL.
const BASE_URL = import.meta.env.DEV ? '' : SERVER_URL;

const http = axios.create({ baseURL: BASE_URL });

// Attach token from storage on every request
http.interceptors.request.use((cfg) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token && cfg.headers) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export const browserSakAPI = {
  auth: {
    login: async (username: string, password: string) => {
      try {
        const { data } = await http.post('/api/auth/login', { username, password });
        localStorage.setItem(TOKEN_KEY, data.accessToken);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        const perms: string[] = data.user?.permissions ?? [];
        localStorage.setItem(PERMS_KEY, JSON.stringify(perms));
        return {
          success: true,
          user: {
            id: data.user.id,
            username: data.user.username,
            email: data.user.email ?? '',
            role: data.user.role,
          },
          permissions: perms,
        };
      } catch (err: any) {
        const msg = err.response?.data?.message ?? 'Login failed';
        return { success: false, message: msg };
      }
    },

    logout: async () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(PERMS_KEY);
    },

    getSession: async () => {
      const token   = localStorage.getItem(TOKEN_KEY);
      const userStr = localStorage.getItem(USER_KEY);
      const permsStr = localStorage.getItem(PERMS_KEY);
      if (!token || !userStr) return null;
      const user = JSON.parse(userStr);
      return {
        userId: user.id,
        username: user.username,
        roleSlug: user.role?.slug ?? '',
        permissions: permsStr ? JSON.parse(permsStr) : [],
        _user: user,          // extra field used in App.tsx to preserve full user
      };
    },
  },

  employees: {
    list: async (params?: Record<string, unknown>) => {
      const { data } = await http.get('/api/employees', { params });
      return data;
    },
    get: async (id: string) => {
      const { data } = await http.get(`/api/employees/${id}`);
      return data;
    },
    create: async (payload: unknown) => {
      const { data } = await http.post('/api/employees', payload);
      return data;
    },
    update: async (id: string, payload: unknown) => {
      const { data } = await http.put(`/api/employees/${id}`, payload);
      return data;
    },
    delete: async (id: string) => {
      const { data } = await http.delete(`/api/employees/${id}`);
      return data;
    },
    addEducation: async (employeeId: string, payload: unknown) => {
      const { data } = await http.post(`/api/employees/${employeeId}/education`, payload);
      return data;
    },
    deleteEducation: async (employeeId: string, eduId: string) => {
      await http.delete(`/api/employees/${employeeId}/education/${eduId}`);
    },
  },

  employment: {
    getByEmployee: async (employeeId: string) => {
      const { data } = await http.get(`/api/employment/${employeeId}`);
      return data;
    },
    create: async (payload: unknown) => {
      const { data } = await http.post('/api/employment', payload);
      return data;
    },
    addSalary: async (employmentId: string, payload: unknown) => {
      const { data } = await http.post(`/api/employment/${employmentId}/salary`, payload);
      return data;
    },
  },

  transfers: {
    list: async (params?: Record<string, unknown>) => {
      const { data } = await http.get('/api/transfers', { params });
      return data;
    },
    create: async (payload: unknown) => {
      const { data } = await http.post('/api/transfers', payload);
      return data;
    },
    approve: async (id: string, action: 'approved' | 'rejected') => {
      const endpoint = action === 'approved' ? 'approve' : 'reject';
      const { data } = await http.patch(`/api/transfers/${id}/${endpoint}`);
      return data;
    },
  },

  performance: {
    list: async (params?: Record<string, unknown>) => {
      const { data } = await http.get('/api/performance', { params });
      return data;
    },
    get: async (id: string) => {
      const { data } = await http.get(`/api/performance/${id}`);
      return data;
    },
    create: async (payload: unknown) => {
      const { data } = await http.post('/api/performance', payload);
      return data;
    },
  },

  training: {
    list: async (params?: Record<string, unknown>) => {
      const { data } = await http.get('/api/training', { params });
      return data;
    },
    create: async (payload: unknown) => {
      const { data } = await http.post('/api/training', payload);
      return data;
    },
    update: async (id: string, payload: unknown) => {
      const { data } = await http.put(`/api/training/${id}`, payload);
      return data;
    },
    delete: async (id: string) => {
      const { data } = await http.delete(`/api/training/${id}`);
      return data;
    },
  },

  documents: {
    list: async (params?: Record<string, unknown>) => {
      const { data } = await http.get('/api/documents', { params });
      return data;
    },
    upload: async (formData: FormData) => {
      const { data } = await http.post('/api/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    openFile: async (id: string) => {
      const resp = await http.get(`/api/documents/${id}/file`, { responseType: 'blob' });
      const url = URL.createObjectURL(resp.data);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    },
    downloadFile: async (id: string, filename: string) => {
      const resp = await http.get(`/api/documents/${id}/file?download=1`, { responseType: 'blob' });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
    delete: async (id: string) => {
      const { data } = await http.delete(`/api/documents/${id}`);
      return data;
    },
  },

  reports: {
    summary: async () => {
      const { data } = await http.get('/api/reports/summary');
      return data;
    },
    staffPerCampus: async () => {
      const { data } = await http.get('/api/reports/staff-per-campus');
      return data;
    },
    transfersHistory: async (year?: string) => {
      const { data } = await http.get('/api/reports/transfers-history', { params: year ? { year } : {} });
      return data;
    },
    performanceRanking: async (academicYear?: string) => {
      const { data } = await http.get('/api/reports/performance-ranking', {
        params: academicYear ? { academicYear } : {},
      });
      return data;
    },
  },

  users: {
    list: async () => {
      const { data } = await http.get('/api/users');
      return data;
    },
    create: async (payload: unknown) => {
      const { data } = await http.post('/api/users', payload);
      return data;
    },
    toggleActive: async (id: string) => {
      const { data } = await http.patch(`/api/users/${id}/toggle-active`);
      return data;
    },
    roles: async () => {
      const { data } = await http.get('/api/users/roles');
      return data;
    },
  },

  campuses: {
    list: async () => {
      const { data } = await http.get('/api/campuses');
      return data;
    },
    get: async (id: string) => {
      const { data } = await http.get(`/api/campuses/${id}`);
      return data;
    },
    create: async (payload: unknown) => {
      const { data } = await http.post('/api/campuses', payload);
      return data;
    },
    update: async (id: string, payload: unknown) => {
      const { data } = await http.put(`/api/campuses/${id}`, payload);
      return data;
    },
    toggleActive: async (id: string) => {
      const { data } = await http.patch(`/api/campuses/${id}/toggle-active`);
      return data;
    },
    // Departments
    listDepartments: async (campusId?: string) => {
      const { data } = await http.get('/api/campuses/departments/all', {
        params: campusId ? { campusId } : {},
      });
      return data;
    },
    createDepartment: async (payload: unknown) => {
      const { data } = await http.post('/api/campuses/departments', payload);
      return data;
    },
    updateDepartment: async (id: string, payload: unknown) => {
      const { data } = await http.put(`/api/campuses/departments/${id}`, payload);
      return data;
    },
    toggleDeptActive: async (id: string) => {
      const { data } = await http.patch(`/api/campuses/departments/${id}/toggle-active`);
      return data;
    },
  },

  jobTitles: {
    list: async (params?: Record<string, unknown>) => {
      const { data } = await http.get('/api/job-titles', { params });
      return data;
    },
    create: async (payload: unknown) => {
      const { data } = await http.post('/api/job-titles', payload);
      return data;
    },
    update: async (id: string, payload: unknown) => {
      const { data } = await http.put(`/api/job-titles/${id}`, payload);
      return data;
    },
    toggleActive: async (id: string) => {
      const { data } = await http.patch(`/api/job-titles/${id}/toggle-active`);
      return data;
    },
  },

  sync: {
    trigger: async () => { /* no-op in browser */ },
    getStatus: async () => ({ isSyncing: false, lastSyncAt: null, pendingCount: 0 }),
    onStatusChange: (_cb: (s: unknown) => void) => { /* no-op in browser */ },
  },

  classes: {
    list: async (params?: Record<string, unknown>) => {
      const { data } = await http.get('/api/classes', { params });
      return data;
    },
    create: async (payload: unknown) => {
      const { data } = await http.post('/api/classes', payload);
      return data;
    },
    update: async (id: string, payload: unknown) => {
      const { data } = await http.put(`/api/classes/${id}`, payload);
      return data;
    },
    toggleActive: async (id: string) => {
      const { data } = await http.patch(`/api/classes/${id}/toggle-active`);
      return data;
    },
    delete: async (id: string) => {
      await http.delete(`/api/classes/${id}`);
    },
    addStream: async (classId: string, payload: unknown) => {
      const { data } = await http.post(`/api/classes/${classId}/streams`, payload);
      return data;
    },
    deleteStream: async (streamId: string) => {
      await http.delete(`/api/classes/streams/${streamId}`);
    },
  },

  staffing: {
    gaps: async () => {
      const { data } = await http.get('/api/staffing/gaps');
      return data;
    },
    listEstablishment: async () => {
      const { data } = await http.get('/api/staffing/establishment');
      return data;
    },
    createEstablishment: async (payload: unknown) => {
      const { data } = await http.post('/api/staffing/establishment', payload);
      return data;
    },
    updateEstablishment: async (id: string, payload: unknown) => {
      const { data } = await http.put(`/api/staffing/establishment/${id}`, payload);
      return data;
    },
    deleteEstablishment: async (id: string) => {
      await http.delete(`/api/staffing/establishment/${id}`);
    },
  },
};
