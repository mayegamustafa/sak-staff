// ─────────────────────────────────────────────
//  Performance Appraisal Types
// ─────────────────────────────────────────────

// ── Legacy types (kept for backward compatibility with old appraisals table) ──
export type AppraisalPeriod = 'term_1' | 'term_2' | 'term_3' | 'annual' | 'probation';
export type RatingScale = 1 | 2 | 3 | 4 | 5;

export interface KPI {
  id: string;
  appraisalId: string;
  description: string;
  target: string;
  actualAchievement: string;
  weight: number;
  score: RatingScale;
}

export interface Appraisal {
  id: string;
  employeeId: string;
  supervisorId: string;
  period: AppraisalPeriod;
  academicYear: string;
  conductedDate: string;
  overallScore: number;
  overallRating?: string;
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

// ─────────────────────────────────────────────
//  Dynamic Appraisal System Types
// ─────────────────────────────────────────────

export type TermLabel = 'I' | 'II' | 'III';
export type AppraisalCategoryLabel = 'ACHIEVED' | 'PROMISING' | 'NEEDS IMPROVEMENT';

export interface AppraisalTemplate {
  id: string;
  name: string;
  year: number | null;
  isActive: boolean;
  categories?: AppraisalCategory[];
  createdAt: string;
  updatedAt: string;
}

export interface AppraisalCategory {
  id: string;
  templateId: string;
  name: string;
  maxScore: number;
  weight: number | null;
  orderIndex: number;
  items?: AppraisalItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AppraisalItem {
  id: string;
  categoryId: string;
  name: string;
  maxScore: number;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface StaffAppraisal {
  id: string;
  employeeId: string;
  templateId: string;
  year: number;
  annualAverage: number | null;
  categoryLabel: AppraisalCategoryLabel | null;
  guidanceComment: string | null;
  otherObservations: string | null;
  preparedBy: string | null;
  approvedBy: string | null;
  terms?: AppraisalTerm[];
  template?: AppraisalTemplate;
  // joined from employees
  employeeName?: string;
  staffNo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppraisalTerm {
  id: string;
  appraisalId: string;
  term: TermLabel;
  termScore: number | null;
  ranking: string | null;
  categoryLabel: AppraisalCategoryLabel | null;
  scores?: AppraisalScore[];
  createdAt: string;
  updatedAt: string;
}

export interface AppraisalScore {
  id: string;
  appraisalTermId: string;
  categoryId: string;
  itemId: string | null;
  score: number;
  // Joined
  categoryName?: string;
  categoryMaxScore?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateDto {
  name: string;
  year?: number | null;
  isActive?: boolean;
  categories?: {
    name: string;
    maxScore: number;
    weight?: number | null;
    orderIndex: number;
    items?: { name: string; maxScore: number; orderIndex: number }[];
  }[];
}

export interface CreateStaffAppraisalDto {
  employeeId: string;
  templateId: string;
  year: number;
  guidanceComment?: string;
  otherObservations?: string;
  preparedBy?: string;
  approvedBy?: string;
  terms: {
    term: TermLabel;
    scores: { categoryId: string; itemId?: string | null; score: number }[];
  }[];
}

export interface UpdateStaffAppraisalDto {
  guidanceComment?: string;
  otherObservations?: string;
  preparedBy?: string;
  approvedBy?: string;
  terms?: {
    term: TermLabel;
    scores: { categoryId: string; itemId?: string | null; score: number }[];
  }[];
}

/** Compute category label from percentage score */
export function getCategoryLabel(pct: number): AppraisalCategoryLabel {
  if (pct >= 75) return 'ACHIEVED';
  if (pct >= 50) return 'PROMISING';
  return 'NEEDS IMPROVEMENT';
}
