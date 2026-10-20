import { z } from 'zod';

/** Passwords everyone tries first. Lower-cased comparison. */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', '123456789', '1234567890',
  'qwerty123', 'qwertyuiop', 'iloveyou1', 'admin12345', 'administrator',
  'welcome123', 'letmein123', 'changeme123', 'sak2026', 'admin@sak2026',
  'sakschools', 'apollokaggwa',
]);

export const PASSWORD_RULES = 'at least 10 characters, including a letter and a number';

/**
 * Returns a human-readable reason the password is unacceptable, or null if it is fine.
 * bcrypt only looks at the first 72 bytes, so longer passwords are rejected rather
 * than silently truncated.
 */
export function passwordProblem(password: string, username?: string): string | null {
  if (password.length < 10) return `Password must be ${PASSWORD_RULES}.`;
  if (Buffer.byteLength(password, 'utf8') > 72) return 'Password must be at most 72 bytes long.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return `Password must be ${PASSWORD_RULES}.`;
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'That password is too common. Choose another.';
  if (username && username.length >= 3 && password.toLowerCase().includes(username.toLowerCase())) {
    return 'Password must not contain the username.';
  }
  return null;
}

/** Zod schema for a new password (username-independent checks). */
export const NewPasswordSchema = z.string().superRefine((val, ctx) => {
  const problem = passwordProblem(val);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});
