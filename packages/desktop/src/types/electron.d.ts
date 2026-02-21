// Type declarations for the Electron preload API exposed on window.sakAPI

interface SakAPI {
  auth: {
    login: (username: string, password: string) => Promise<{
      success: boolean;
      message?: string;
      user?: { id: string; username: string; email: string; role: { slug: string; name: string } };
      permissions?: string[];
    }>;
    logout: () => Promise<void>;
    getSession: () => Promise<{
      userId: string;
      username: string;
      roleSlug: string;
      permissions: string[];
    } | null>;
  };

  employees: {
    list: (params?: Record<string, unknown>) => Promise<{ data: unknown[]; total: number } | unknown[]>;
    get: (id: string) => Promise<unknown>;
    create: (data: unknown) => Promise<{ success: boolean; data?: unknown; offline?: boolean }>;
    update: (id: string, data: unknown) => Promise<{ success: boolean; data?: unknown }>;
    delete: (id: string) => Promise<{ success: boolean }>;
    addEducation: (employeeId: string, data: unknown) => Promise<unknown>;
    deleteEducation: (employeeId: string, eduId: string) => Promise<void>;
  };

  employment: {
    getByEmployee: (employeeId: string) => Promise<unknown[]>;
    create: (data: unknown) => Promise<{ success: boolean; data?: unknown }>;
    addSalary: (employmentId: string, data: unknown) => Promise<{ success: boolean; data?: unknown }>;
  };

  transfers: {
    list: (params?: Record<string, unknown>) => Promise<unknown[]>;
    create: (data: unknown) => Promise<{ success: boolean; data?: unknown }>;
    approve: (id: string, action: 'approved' | 'rejected') => Promise<{ success: boolean; data?: unknown }>;
  };

  performance: {
    list: (params?: Record<string, unknown>) => Promise<unknown[]>;
    get: (id: string) => Promise<unknown>;
    create: (data: unknown) => Promise<{ success: boolean; data?: unknown }>;
  };

  training: {
    list: (params?: Record<string, unknown>) => Promise<unknown[]>;
    create: (data: unknown) => Promise<{ success: boolean; data?: unknown }>;
    update: (id: string, data: unknown) => Promise<{ success: boolean; data?: unknown }>;
    delete: (id: string) => Promise<{ success: boolean }>;
  };

  documents: {
    list: (params?: Record<string, unknown>) => Promise<unknown[]>;
    upload: (data: FormData) => Promise<{ success: boolean; data?: unknown }>;
    openFile: (id: string) => Promise<void>;
    downloadFile: (id: string, filename: string) => Promise<void>;
    delete: (id: string) => Promise<{ success: boolean }>;
  };

  reports: {
    summary: () => Promise<unknown>;
    staffPerCampus: () => Promise<unknown[]>;
    transfersHistory: (year?: string) => Promise<unknown[]>;
    performanceRanking: (academicYear?: string) => Promise<unknown[]>;
  };

  users: {
    list: () => Promise<unknown[]>;
    create: (data: unknown) => Promise<unknown>;
    toggleActive: (id: string) => Promise<{ id: string; is_active: boolean }>;
    roles: () => Promise<unknown[]>;
  };

  campuses: {
    list: () => Promise<unknown[]>;
    get: (id: string) => Promise<unknown>;
    create: (data: unknown) => Promise<unknown>;
    update: (id: string, data: unknown) => Promise<unknown>;
    toggleActive: (id: string) => Promise<{ id: string; is_active: boolean }>;
    listDepartments: (campusId?: string) => Promise<unknown[]>;
    createDepartment: (data: unknown) => Promise<unknown>;
    updateDepartment: (id: string, data: unknown) => Promise<unknown>;
    toggleDeptActive: (id: string) => Promise<{ id: string; is_active: boolean }>;
  };

  jobTitles: {
    list: (params?: Record<string, unknown>) => Promise<unknown[]>;
    create: (data: unknown) => Promise<unknown>;
    update: (id: string, data: unknown) => Promise<unknown>;
    toggleActive: (id: string) => Promise<{ id: string; is_active: boolean }>;
  };

  classes: {
    list: (params?: Record<string, unknown>) => Promise<unknown[]>;
    create: (data: unknown) => Promise<unknown>;
    update: (id: string, data: unknown) => Promise<unknown>;
    toggleActive: (id: string) => Promise<{ id: string; is_active: boolean }>;
    delete: (id: string) => Promise<void>;
    addStream: (classId: string, data: unknown) => Promise<unknown>;
    deleteStream: (streamId: string) => Promise<void>;
  };

  staffing: {
    gaps: () => Promise<unknown[]>;
    listEstablishment: () => Promise<unknown[]>;
    createEstablishment: (data: unknown) => Promise<unknown>;
    updateEstablishment: (id: string, data: unknown) => Promise<unknown>;
    deleteEstablishment: (id: string) => Promise<void>;
  };

  sync: {
    trigger: () => Promise<{ success: boolean; message?: string }>;
    getStatus: () => Promise<{ deviceId?: string; pendingCount: number; isSyncing: boolean; lastSyncAt?: string }>;
    onStatusChange: (callback: (status: unknown) => void) => void;
  };
}

declare interface Window {
  sakAPI: SakAPI;
}
