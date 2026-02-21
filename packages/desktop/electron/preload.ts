import { contextBridge, ipcRenderer } from 'electron';

// Expose a safe API to the renderer process via window.sakAPI
contextBridge.exposeInMainWorld('sakAPI', {
  // Auth
  auth: {
    login: (username: string, password: string) =>
      ipcRenderer.invoke('auth:login', { username, password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
  },

  // Employees
  employees: {
    list: (params?: Record<string, unknown>) => ipcRenderer.invoke('employees:list', params),
    get: (id: string) => ipcRenderer.invoke('employees:get', id),
    create: (data: unknown) => ipcRenderer.invoke('employees:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('employees:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('employees:delete', id),
  },

  // Employment
  employment: {
    getByEmployee: (employeeId: string) => ipcRenderer.invoke('employment:getByEmployee', employeeId),
    create: (data: unknown) => ipcRenderer.invoke('employment:create', data),
    addSalary: (employmentId: string, data: unknown) => ipcRenderer.invoke('employment:addSalary', employmentId, data),
  },

  // Transfers
  transfers: {
    list: (params?: Record<string, unknown>) => ipcRenderer.invoke('transfers:list', params),
    create: (data: unknown) => ipcRenderer.invoke('transfers:create', data),
    approve: (id: string, action: 'approved' | 'rejected') => ipcRenderer.invoke('transfers:approve', id, action),
  },

  // Performance
  performance: {
    list: (params?: Record<string, unknown>) => ipcRenderer.invoke('performance:list', params),
    get: (id: string) => ipcRenderer.invoke('performance:get', id),
    create: (data: unknown) => ipcRenderer.invoke('performance:create', data),
  },

  // Training
  training: {
    list: (params?: Record<string, unknown>) => ipcRenderer.invoke('training:list', params),
    create: (data: unknown) => ipcRenderer.invoke('training:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('training:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('training:delete', id),
  },

  // Documents
  documents: {
    list: (params?: Record<string, unknown>) => ipcRenderer.invoke('documents:list', params),
    upload: (data: unknown) => ipcRenderer.invoke('documents:upload', data),
    delete: (id: string) => ipcRenderer.invoke('documents:delete', id),
  },

  // Reports
  reports: {
    summary: () => ipcRenderer.invoke('reports:summary'),
    staffPerCampus: () => ipcRenderer.invoke('reports:staffPerCampus'),
    transfersHistory: (year?: string) => ipcRenderer.invoke('reports:transfersHistory', year),
    performanceRanking: (academicYear?: string) => ipcRenderer.invoke('reports:performanceRanking', academicYear),
  },

  // Sync
  sync: {
    trigger: () => ipcRenderer.invoke('sync:trigger'),
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    onStatusChange: (callback: (status: unknown) => void) => {
      ipcRenderer.on('sync:statusUpdate', (_evt, status) => callback(status));
    },
  },
});
