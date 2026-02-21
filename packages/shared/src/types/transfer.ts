// ─────────────────────────────────────────────
//  Transfer & Promotion Types
// ─────────────────────────────────────────────

export type TransferType = 'transfer' | 'promotion' | 'demotion' | 'acting' | 'temporary_assignment';
export type TransferStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface Transfer {
  id: string;
  employeeId: string;
  type: TransferType;
  status: TransferStatus;
  fromCampusId: string;
  toCampusId: string;
  fromDepartmentId?: string;
  toDepartmentId?: string;
  fromJobTitle?: string;
  toJobTitle?: string;
  effectiveDate: string;      // ISO date string
  endDate?: string;           // for temporary / acting roles
  reason: string;
  notes?: string;
  recommendedBy?: string;     // userId (HR / Quality Head)
  approvedBy?: string;        // userId (GM / Super Admin)
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
}

export type CreateTransferDto = Omit<Transfer, 'id' | 'createdAt' | 'updatedAt' | 'syncedAt'>;
export type UpdateTransferDto = Partial<CreateTransferDto>;
