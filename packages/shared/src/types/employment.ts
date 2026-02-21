// ─────────────────────────────────────────────
//  Employment / Contract Types
// ─────────────────────────────────────────────

export type ContractType = 'permanent' | 'contract' | 'probation' | 'casual' | 'internship';
export type EmploymentStatus = 'active' | 'on_leave' | 'suspended' | 'retired' | 'resigned' | 'terminated';
export type PaymentFrequency = 'monthly' | 'weekly' | 'daily';

export interface Department {
  id: string;
  name: string;
  code: string;
  campusId: string;
  headEmployeeId?: string;
}

export interface Campus {
  id: string;
  name: string;
  code: string;          // e.g. "SAK-MAIN", "SAK-KAVULE"
  address?: string;
  phone?: string;
  email?: string;
  principalEmployeeId?: string;
}

export interface SalaryRecord {
  id: string;
  employmentId: string;
  amount: number;
  currency: string;      // Default: UGX
  paymentFrequency: PaymentFrequency;
  effectiveDate: string; // ISO date string
  endDate?: string;
  reason?: string;       // "Annual increment", "Promotion", etc.
  approvedBy?: string;   // userId
}

export interface Employment {
  id: string;
  employeeId: string;
  campusId: string;
  departmentId: string;
  jobTitle: string;
  payGrade?: string;     // Pay Grade (Uganda Public Service scale)
  contractType: ContractType;
  status: EmploymentStatus;
  startDate: string;     // ISO date string
  endDate?: string;
  contractPath?: string; // uploaded contract document
  appointmentLetterPath?: string;
  reportingToEmployeeId?: string;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
  salaryHistory?: SalaryRecord[];
}

export type CreateEmploymentDto = Omit<Employment, 'id' | 'createdAt' | 'updatedAt' | 'syncedAt'>;
export type UpdateEmploymentDto = Partial<CreateEmploymentDto>;
