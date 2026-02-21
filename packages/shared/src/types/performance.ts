// ─────────────────────────────────────────────
//  Performance Appraisal Types
// ─────────────────────────────────────────────

export type AppraisalPeriod = 'term_1' | 'term_2' | 'term_3' | 'annual' | 'probation';
export type RatingScale = 1 | 2 | 3 | 4 | 5;

export interface KPI {
  id: string;
  appraisalId: string;
  description: string;
  target: string;
  actualAchievement: string;
  weight: number;         // percentage (e.g. 20 = 20%)
  score: RatingScale;
}

export interface Appraisal {
  id: string;
  employeeId: string;
  supervisorId: string;   // who conducted the appraisal
  period: AppraisalPeriod;
  academicYear: string;   // e.g. "2025/2026"
  conductedDate: string;  // ISO date string
  overallScore: number;   // computed average 1–5
  overallRating?: string; // "Excellent" | "Good" | "Fair" | "Poor"
  supervisorComments?: string;
  employeeComments?: string;
  isEligibleForPromotion: boolean;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
  kpis?: KPI[];
}

export type CreateAppraisalDto = Omit<Appraisal, 'id' | 'createdAt' | 'updatedAt' | 'syncedAt'>;
export type UpdateAppraisalDto = Partial<CreateAppraisalDto>;
