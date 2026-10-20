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
 * Generate SAK staff number: SAK-[CAMPUS]-YYYY-NNNN
 * Examples: SAK-MN-2026-0001  /  SAK-2026-0001 (no campus)
 * campusCode: raw campus code from DB — any "SAK-" prefix is stripped, max 6 chars used.
 */
export function generateStaffNo(year: number, sequence: number, campusCode?: string | null): string {
  const seq = String(sequence).padStart(4, '0');
  if (campusCode) {
    const code = campusCode.replace(/^SAK[-/]/i, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (code) return `SAK-${code}-${year}-${seq}`;
  }
  return `SAK-${year}-${seq}`;
}
