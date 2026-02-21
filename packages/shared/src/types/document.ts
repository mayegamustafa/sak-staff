// ─────────────────────────────────────────────
//  Document Manager Types
// ─────────────────────────────────────────────

export type DocumentCategory =
  | 'contract'
  | 'appointment_letter'
  | 'warning_letter'
  | 'payslip'
  | 'evaluation'
  | 'certificate'
  | 'national_id'
  | 'passport'
  | 'cv'
  | 'photo'
  | 'other';

export interface StaffDocument {
  id: string;
  employeeId: string;
  category: DocumentCategory;
  title: string;
  filePath: string;          // relative path on server / absolute locally
  mimeType: string;
  fileSizeBytes: number;
  uploadedBy: string;        // userId
  issuedDate?: string;       // ISO date, if applicable
  expiryDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
}

export type CreateDocumentDto = Omit<StaffDocument, 'id' | 'createdAt' | 'updatedAt' | 'syncedAt'>;
