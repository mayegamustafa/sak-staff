// ─────────────────────────────────────────────
//  Training & Professional Development Types
// ─────────────────────────────────────────────

export type TrainingType = 'workshop' | 'seminar' | 'course' | 'conference' | 'on_the_job' | 'online';

export interface Training {
  id: string;
  employeeId: string;
  title: string;
  type: TrainingType;
  provider: string;           // Organisation / Institution
  venue?: string;
  startDate: string;          // ISO date string
  endDate: string;
  durationDays: number;
  skills: string[];           // tags: ["leadership", "ICT", ...]
  cost?: number;
  currency?: string;
  paymentBy?: 'employer' | 'employee' | 'sponsored';
  certificatePath?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
}

export type CreateTrainingDto = Omit<Training, 'id' | 'createdAt' | 'updatedAt' | 'syncedAt'>;
export type UpdateTrainingDto = Partial<CreateTrainingDto>;
