// ─────────────────────────────────────────────
//  Employee / Staff Profiling Types
// ─────────────────────────────────────────────

export type Gender = 'male' | 'female' | 'other';
export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed';
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'unknown';

export interface EmergencyContact {
  id: string;
  employeeId: string;
  fullName: string;
  relationship: string;
  phone: string;
  phone2?: string;
  address?: string;
}

export interface EducationRecord {
  id: string;
  employeeId: string;
  institution: string;
  qualification: string;   // e.g. "Bachelor of Education"
  fieldOfStudy: string;
  yearFrom: number;
  yearTo: number;
  grade?: string;
  documentPath?: string;   // relative path to uploaded file
}

export interface Certification {
  id: string;
  employeeId: string;
  name: string;
  issuingBody: string;
  issueDate: string;       // ISO date string
  expiryDate?: string;
  documentPath?: string;
}

export interface Employee {
  id: string;               // UUID
  staffNo: string;          // SAK-YYYY-NNNN
  firstName: string;
  middleName?: string;
  lastName: string;
  gender: Gender;
  dateOfBirth: string;      // ISO date string
  nationality: string;
  nationalId?: string;
  passportNo?: string;
  maritalStatus: MaritalStatus;
  bloodGroup?: BloodGroup;
  religion?: string;
  phone: string;
  phone2?: string;
  email?: string;
  residentialAddress?: string;
  photoPath?: string;
  cvPath?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
  emergencyContacts?: EmergencyContact[];
  education?: EducationRecord[];
  certifications?: Certification[];
}

export type CreateEmployeeDto = Omit<Employee, 'id' | 'staffNo' | 'createdAt' | 'updatedAt' | 'syncedAt'>;
export type UpdateEmployeeDto = Partial<CreateEmployeeDto>;
