// ─────────────────────────────────────────────
//  Date / Time Utilities
// ─────────────────────────────────────────────

/**
 * Returns current ISO string – use everywhere so we have
 * a single consistent timestamp format across SQLite + PostgreSQL.
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Format a date string for display (DD/MM/YYYY).
 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Calculate how many years between a date and now.
 * Used for age or years of service.
 */
export function yearsFrom(iso: string): number {
  const start = new Date(iso);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  const m = now.getMonth() - start.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < start.getDate())) {
    years--;
  }
  return years;
}

/**
 * Returns true if the given ISO string date is in the past.
 */
export function isExpired(iso: string): boolean {
  return new Date(iso) < new Date();
}

/**
 * Generate SAK staff number: SAK-YYYY-NNNN
 */
export function generateStaffNo(year: number, sequence: number): string {
  return `SAK-${year}-${String(sequence).padStart(4, '0')}`;
}
