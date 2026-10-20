// Type declarations for the Electron preload API exposed on window.sakAPI

interface SakAPI {
  auth: {
    login: (username: string, password: string) => Promise<{
      success: boolean;
      message?: string;
      user?: { id: string; username: string; email: string; role: { slug: string; name: string } };
      permissions?: string[];
      mustChangePassword?: boolean;
    }>;
    logout: () => Promise<void>;
    changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message?: string }>;
    getSession: () => Promise<{
      userId: string;
      username: string;
      roleSlug: string;
      permissions: string[];
      mustChangePassword?: boolean;
    } | null>;
  };

  employees: {
    list: (params?: Record<string, unknown>) => Promise<{ data: unknown[]; total: number } | unknown[]>;
    get: (id: string) => Promise<unknown>;
    create: (data: unknown) => Promise<{ success: boolean; data?: unknown; offline?: boolean }>;
    update: (id: string, data: unknown) => Promise<{ success: boolean; data?: unknown }>;
    delete: (id: string) => Promise<{ success: boolean }>;
    addEducation: (employeeId: string, data: unknown) => Promise<unknown>;
    updateEducation: (employeeId: string, eduId: string, data: unknown) => Promise<unknown>;
    deleteEducation: (employeeId: string, eduId: string) => Promise<void>;
    addWorkHistory: (employeeId: string, data: unknown) => Promise<unknown>;
    updateWorkHistory: (employeeId: string, whId: string, data: unknown) => Promise<unknown>;
    deleteWorkHistory: (employeeId: string, whId: string) => Promise<void>;
    addReferee: (employeeId: string, data: unknown) => Promise<unknown>;
    updateReferee: (employeeId: string, refId: string, data: unknown) => Promise<unknown>;
    deleteReferee: (employeeId: string, refId: string) => Promise<void>;
    addEmergency: (employeeId: string, data: unknown) => Promise<unknown>;
    updateEmergency: (employeeId: string, contactId: string, data: unknown) => Promise<unknown>;
    deactivate: (id: string, payload: { exitReason: string; exitDate: string; exitNotes?: string }) => Promise<unknown>;
    reactivate: (id: string) => Promise<unknown>;
    bulkImportTemplate: () => Promise<{ ok: boolean; data?: Uint8Array; status?: number; error?: string }>;
    bulkImportPreview: (fileBuffer: ArrayBuffer) => Promise<{ valid: unknown[]; errors: { row: number; national_id?: string; message: string }[]; total: number }>;
    bulkImportConfirm: (rows: unknown[]) => Promise<{ created: number; createdNames: string[]; errors: { name: string; message: string }[] }>;
    generateOnboardingToken: (id: string) => Promise<{ id: string; token: string; expires_at: string; staffNo: string; employeeName: string }>;
    listOnboardingTokens: (id: string) => Promise<{ id: string; token: string; created_at: string; used_at: string | null; is_revoked: boolean }[]>;
    revokeOnboardingToken: (tokenId: string) => Promise<void>;
    getBankDetails: (employeeId: string) => Promise<unknown[]>;
    getClasses: (employeeId: string) => Promise<unknown[]>;
    updateClasses: (employeeId: string, classIds: string[]) => Promise<unknown>;
  };

  employment: {
    getByEmployee: (employeeId: string) => Promise<unknown[]>;
    create: (data: unknown) => Promise<{ success: boolean; data?: unknown }>;
    update: (employmentId: string, data: unknown) => Promise<unknown>;
    addSalary: (employmentId: string, data: unknown) => Promise<{ success: boolean; data?: unknown }>;
  };

  transfers: {
    list: (params?: Record<string, unknown>) => Promise<unknown[]>;
    create: (data: unknown) => Promise<{ success: boolean; data?: unknown }>;
    update: (id: string, data: unknown) => Promise<{ success: boolean; data?: unknown }>;
    approve: (id: string, action: 'approved' | 'rejected', meta?: { approvalComment?: string; approvalSignature?: string; approvalRole?: string; approvalDate?: string }) => Promise<{ success: boolean; data?: unknown }>;
    cancel: (id: string) => Promise<{ success: boolean; data?: unknown }>;
    delete: (id: string) => Promise<void>;
  };

  performance: {
    list: (params?: Record<string, unknown>) => Promise<unknown[]>;
    get: (id: string) => Promise<unknown>;
    create: (data: unknown) => Promise<{ success: boolean; data?: unknown }>;
    delete: (id: string) => Promise<{ success: boolean }>;
  };

  appraisalTemplates: {
    list: () => Promise<unknown[]>;
    get: (id: string) => Promise<unknown>;
    create: (data: unknown) => Promise<unknown>;
    update: (id: string, data: unknown) => Promise<unknown>;
    delete: (id: string) => Promise<void>;
  };

  staffAppraisals: {
    list: (params?: Record<string, unknown>) => Promise<unknown[]>;
    get: (id: string) => Promise<unknown>;
    getByEmployee: (employeeId: string) => Promise<unknown[]>;
    create: (data: unknown) => Promise<unknown>;
    update: (id: string, data: unknown) => Promise<unknown>;
    delete: (id: string) => Promise<void>;
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
    /** Raw bytes of a document, fetched with the session's bearer token. */
    file: (id: string) => Promise<{ ok: boolean; data?: Uint8Array; mimeType?: string; status?: number; error?: string }>;
    openFile: (id: string) => Promise<void | { success: boolean; message?: string }>;
    downloadFile: (id: string, filename: string) => Promise<void | { success: boolean; canceled?: boolean; message?: string; path?: string }>;
    delete: (id: string) => Promise<{ success: boolean }>;
    listScanners: () => Promise<{ scanners: { device: string; name: string }[]; error?: string }>;
    scan: (payload: { employeeId: string; category: string; title: string; device?: string; resolution?: string; format?: string }) => Promise<unknown>;
    uploadBase64: (payload: { employeeId: string; category: string; title: string; dataUrl: string; issuedDate?: string; expiryDate?: string }) => Promise<unknown>;
  };

  onboarding: {
    generateLink: (campusId: string, label?: string) => Promise<{ id: string; token: string; campus_id: string; campus_name: string; expires_at: string; recipient_name: string | null; submission_count: number }>;
    listTokens: () => Promise<{ id: string; token: string; campus_id: string | null; campus_name: string | null; recipient_name: string | null; submission_count: number; is_revoked: boolean; expires_at: string; created_at: string }[]>;
    revokeToken: (id: string) => Promise<void>;
  };

  serverInfo: () => Promise<{ ip: string; port: number; baseUrl: string }>;

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
    resetPassword: (id: string, newPassword: string) => Promise<{ id: string; message: string }>;
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

  attendance: {
    listRecords: (params?: Record<string, unknown>) => Promise<unknown[]>;
    getRecord: (id: string) => Promise<unknown>;
    createRecord: (data: unknown) => Promise<unknown>;
    updateRecord: (id: string, data: unknown) => Promise<unknown>;
    deleteRecord: (id: string) => Promise<void>;
  };

  analytics: {
    overview: (params?: Record<string, unknown>) => Promise<unknown>;
    stations: (params?: Record<string, unknown>) => Promise<unknown[]>;
    staff: (params?: Record<string, unknown>) => Promise<unknown[]>;
    attendance: (params?: Record<string, unknown>) => Promise<unknown>;
    trends: (params?: Record<string, unknown>) => Promise<unknown>;
    absentByStation: (params?: Record<string, unknown>) => Promise<unknown[]>;
    attendanceAlerts: (params?: Record<string, unknown>) => Promise<unknown>;
  };

  academicWeeks: {
    list: (params?: { year?: number; term?: string }) => Promise<unknown[]>;
    generate: (payload: { year: number; term: string }) => Promise<unknown[]>;
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
