import dotenv from 'dotenv';
dotenv.config();

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

/** Secrets that must never survive into a production deployment. */
const INSECURE_SECRETS = new Set([
  'change_me',
  'change_me_refresh',
  'change_this_to_a_long_random_secret_key',
  'change_this_to_another_long_random_secret',
  'secret',
]);

/**
 * Resolve a signing secret, refusing to boot in production with a placeholder.
 * A misconfigured secret means anyone can mint their own admin token, so this
 * fails loudly at startup rather than silently accepting forged sessions.
 */
function requireSecret(name: string, value: string | undefined, devFallback: string): string {
  if (!isProd) return value || devFallback;
  if (!value || INSECURE_SECRETS.has(value) || value.length < 32) {
    throw new Error(
      `${name} must be set to a random value of at least 32 characters in production. ` +
      `Generate one with:  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
    );
  }
  return value;
}

/**
 * Postgres connection. Managed platforms (Railway, Render, Fly, Neon…) hand out
 * a single DATABASE_URL; self-hosted installs use the discrete DB_* vars. Both
 * are supported so the same build runs in either place.
 */
const databaseUrl = process.env.DATABASE_URL || '';

/** Whether to negotiate TLS to Postgres. 'auto' = yes for remote hosts only. */
function resolveDbSsl(): boolean {
  const setting = (process.env.DB_SSL || 'auto').toLowerCase();
  if (setting === 'true'  || setting === '1') return true;
  if (setting === 'false' || setting === '0') return false;
  // auto: local sockets and private networks don't need (or offer) TLS.
  const host = databaseUrl
    ? (() => { try { return new URL(databaseUrl).hostname; } catch { return ''; } })()
    : (process.env.DB_HOST || 'localhost');
  if (!host) return false;
  return !(
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.internal') ||
    host.endsWith('.local')
  );
}

if (isProd && process.env.JWT_SECRET && process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different values.');
}

export const config = {
  env,
  isProd,
  port: parseInt(process.env.PORT || '4000', 10),

  db: {
    url: databaseUrl,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'sak_staff',
    user: process.env.DB_USER || 'sak_admin',
    password: process.env.DB_PASSWORD || '',
    ssl: resolveDbSsl(),
    poolMin: parseInt(process.env.DB_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DB_POOL_MAX || '10', 10),
  },

  jwt: {
    secret: requireSecret('JWT_SECRET', process.env.JWT_SECRET, 'dev_only_insecure_secret'),
    refreshSecret: requireSecret('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET, 'dev_only_insecure_refresh_secret'),
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10),
  },

  cors: {
    // Exact origins, or wildcard subdomains such as https://*.example.org.
    // The app's own origin (same host as the request, or PUBLIC_URL) is always allowed.
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),
  },

  // Where the built web frontend and desktop installers live. Defaults match the
  // monorepo layout (and the Docker image); override when deploying elsewhere.
  paths: {
    frontendDist: process.env.FRONTEND_DIST || '',
    downloadsDir: process.env.DOWNLOADS_DIR || '',
  },

  bodyLimit: process.env.BODY_LIMIT || '20mb',

  log: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || 'logs',
    // Managed platforms collect stdout; writing log files there fills the disk
    // and the files vanish on redeploy. Default to files only when self-hosted.
    toFile: (process.env.LOG_TO_FILE || (isProd && !databaseUrl ? 'true' : 'false')).toLowerCase() === 'true',
  },

  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '600', 10),
    // Consecutive failed logins on one account before it is locked (DB-backed).
    loginMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10),
    loginLockMinutes: parseInt(process.env.LOGIN_LOCK_MINUTES || '15', 10),
    // Failed logins per client IP per 15 minutes, across all usernames (stops
    // password spraying). Generous because a school may share one NAT address.
    loginIpMax: parseInt(process.env.LOGIN_IP_RATE_LIMIT_MAX || '50', 10),
    // Public onboarding form submissions per IP per hour.
    onboardingMax: parseInt(process.env.ONBOARDING_RATE_LIMIT_MAX || '30', 10),
  },

  // Number of reverse-proxy hops in front of the app (cloudflared/nginx = 1,
  // Railway's edge = 1). Needed for correct client IPs and rate limiting.
  trustProxy: parseInt(process.env.TRUST_PROXY || (isProd ? '1' : '0'), 10),

  // Opt-in Content-Security-Policy for the SPA (see app.ts).
  enableCsp: (process.env.ENABLE_CSP || 'false').toLowerCase() === 'true',

  // Optional public URL override (e.g. named Cloudflare tunnel, VPS domain)
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
} as const;
