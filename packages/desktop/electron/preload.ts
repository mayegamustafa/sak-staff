import { contextBridge, ipcRenderer } from 'electron';

// Expose a safe API to the renderer process via window.sakAPI
contextBridge.exposeInMainWorld('sakAPI', {
  // Auth
  auth: {
    login: (username: string, password: string) =>
      ipcRenderer.invoke('auth:login', { username, password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    changePassword: (currentPassword: string, newPassword: string) =>
      ipcRenderer.invoke('auth:changePassword', { currentPassword, newPassword }),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
  },

  // Employees
  employees: {
    list: (params?: Record<string, unknown>) => ipcRenderer.invoke('employees:list', params),
    get: (id: string) => ipcRenderer.invoke('employees:get', id),
    create: (data: unknown) => ipcRenderer.invoke('employees:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('employees:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('employees:delete', id),
    addEducation: (employeeId: string, data: unknown) => ipcRenderer.invoke('employees:addEducation', employeeId, data),
    deleteEducation: (employeeId: string, eduId: string) => ipcRenderer.invoke('employees:deleteEducation', employeeId, eduId),
    addWorkHistory: (employeeId: string, data: unknown) => ipcRenderer.invoke('employees:addWorkHistory', employeeId, data),
    deleteWorkHistory: (employeeId: string, whId: string) => ipcRenderer.invoke('employees:deleteWorkHistory', employeeId, whId),
    addReferee: (employeeId: string, data: unknown) => ipcRenderer.invoke('employees:addReferee', employeeId, data),
    updateReferee: (employeeId: string, refId: string, data: unknown) => ipcRenderer.invoke('employees:updateReferee', employeeId, refId, data),
    deleteReferee: (employeeId: string, refId: string) => ipcRenderer.invoke('employees:deleteReferee', employeeId, refId),
    getBankDetails: (id: string) => ipcRenderer.invoke('employees:getBankDetails', id),
    getClasses: (id: string) => ipcRenderer.invoke('employees:getClasses', id),
    updateClasses: (id: string, classIds: string[]) => ipcRenderer.invoke('employees:updateClasses', id, classIds),
    addEmergency: (employeeId: string, data: unknown) => ipcRenderer.invoke('employees:addEmergency', employeeId, data),
    updateEmergency: (employeeId: string, contactId: string, data: unknown) => ipcRenderer.invoke('employees:updateEmergency', employeeId, contactId, data),
    deactivate: (id: string, exitDate: string) => ipcRenderer.invoke('employees:deactivate', id, exitDate),
    reactivate: (id: string) => ipcRenderer.invoke('employees:reactivate', id),
    bulkImportTemplate: () => ipcRenderer.invoke('employees:bulkImportTemplate'),
    bulkImportPreview: (fileBuffer: ArrayBuffer) => ipcRenderer.invoke('employees:bulkImportPreview', fileBuffer),
    bulkImportConfirm: (rows: unknown[]) => ipcRenderer.invoke('employees:bulkImportConfirm', rows),
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
    update: (id: string, data: unknown) => ipcRenderer.invoke('transfers:update', id, data),
    approve: (id: string, action: 'approved' | 'rejected', meta?: Record<string, unknown>) =>
      ipcRenderer.invoke('transfers:approve', id, action, meta),
    cancel: (id: string) => ipcRenderer.invoke('transfers:cancel', id),
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
    file: (id: string) => ipcRenderer.invoke('documents:file', id),
    openFile: (id: string) => ipcRenderer.invoke('documents:openFile', id),
    downloadFile: (id: string, filename: string) => ipcRenderer.invoke('documents:downloadFile', id, filename),
    delete: (id: string) => ipcRenderer.invoke('documents:delete', id),
  },

  // Classes
  classes: {
    list: (params?: Record<string, unknown>) => ipcRenderer.invoke('classes:list', params),
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

  // Onboarding links
  onboarding: {
    generateLink: (campusId: string, label?: string) =>
      ipcRenderer.invoke('onboarding:generateLink', campusId, label),
    listTokens: () => ipcRenderer.invoke('onboarding:listTokens'),
    revokeToken: (id: string) => ipcRenderer.invoke('onboarding:revokeToken', id),
  },

  // Server info (for building shareable onboarding URLs)
  serverInfo: () => ipcRenderer.invoke('server:info'),
});
