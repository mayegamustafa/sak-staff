import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import db from './db';
import { authenticate } from './middleware/auth';
import { onboardingViewLimiter } from './modules/onboarding/onboarding.routes';

// Route modules
import authRoutes from './modules/auth/auth.routes';
import employeesRoutes from './modules/employees/employees.routes';
import employmentRoutes from './modules/employment/employment.routes';
import transfersRoutes from './modules/transfers/transfers.routes';
import performanceRoutes from './modules/performance/performance.routes';
import appraisalTemplatesRoutes from './modules/performance/appraisal-templates.routes';
import staffAppraisalsRoutes from './modules/performance/staff-appraisals.routes';
import trainingRoutes from './modules/training/training.routes';
import documentsRoutes from './modules/documents/documents.routes';
import reportsRoutes from './modules/reports/reports.routes';
import syncRoutes from './modules/sync/sync.routes';
import usersRoutes from './modules/users/users.routes';
import campusesRoutes  from './modules/campuses/campuses.routes';
import jobTitlesRoutes from './modules/job-titles/job-titles.routes';
import classesRoutes   from './modules/classes/classes.routes';
import staffingRoutes    from './modules/staffing/staffing.routes';
import onboardingRoutes from './modules/onboarding/onboarding.routes';
import bulkImportRoutes from './modules/employees/bulk-import.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import academicWeeksRoutes from './modules/academic-weeks/academic-weeks.routes';

const app = express();

// ── Proxy awareness ─────────────────────────────────────────────────────────
// Behind cloudflared / nginx / Railway every request arrives from the proxy, so
// without this the rate limiter sees one client for the whole school and
// req.ip is useless for logging. TRUST_PROXY = number of proxy hops.
app.set('trust proxy', config.trustProxy);

// ── Security ────────────────────────────────────────────────────────────────
// CSP is opt-in (ENABLE_CSP=true) because the public onboarding pages are
// server-rendered HTML with inline scripts; those are exempted below.
// Uploaded files are never served from this origin – see documents routes.
app.use(helmet({ contentSecurityPolicy: false }));
if (config.enableCsp) {
  const csp = helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  });
  app.use((req, res, next) => {
    // Public onboarding pages render inline scripts/styles – skip them.
    if (req.path.startsWith('/onboarding') || req.path.startsWith('/s/')) return next();
    return csp(req, res, next);
  });
}
// ── CORS ────────────────────────────────────────────────────────────────────
// Allowed: the app's own origin (whatever host it is deployed on), PUBLIC_URL,
// and CORS_ORIGINS (exact, or https://*.example.org wildcards). Nothing is
// hard-coded, so the same build works on any domain. Auth uses bearer tokens,
// not cookies, so credentials are not enabled.
const corsPatterns = config.cors.origins.map((o) =>
  o.includes('*')
    ? new RegExp('^' + o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-zA-Z0-9-]+') + '$')
    : o
);
function originAllowed(origin: string, req: express.Request): boolean {
  if (config.publicUrl && origin === config.publicUrl) return true;
  try {
    // Same-origin requests (SPA served by this server) also carry an Origin header.
    if (new URL(origin).host === req.get('host')) return true;
  } catch { return false; }
  return corsPatterns.some((p) => (typeof p === 'string' ? p === origin : p.test(origin)));
}
app.use(cors((req, cb) => {
  const origin = req.headers.origin;
  // Requests without an Origin (Electron main process, curl, server-to-server).
  if (!origin) return cb(null, { origin: false });
  // Disallowed origins simply get no CORS headers, so the browser blocks them.
  cb(null, { origin: originAllowed(origin, req as express.Request), maxAge: 600 });
}));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.rateLimit.max,
  message: { message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health',
}));

// ── Body / Compression ───────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: config.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));

// API responses carry personal data: never let browsers or proxies cache them.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
});
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()');
  next();
});

// ── Uploaded documents ───────────────────────────────────────────────────────
// Deliberately NOT served as static files. Staff documents (national IDs,
// contracts, passport photos) are personal data and go through
// GET /api/documents/:id/file, which enforces the documents:read permission.

// ── Desktop installer downloads (served without auth) ────────────────────────
const DOWNLOADS_DIR = config.paths.downloadsDir
  ? path.resolve(config.paths.downloadsDir)
  : path.resolve(__dirname, '../downloads');
app.use('/downloads', express.static(DOWNLOADS_DIR, { dotfiles: 'deny', index: false }));

// List available installers (used by in-app banner to decide what to show)
const INSTALLER_EXTS = ['.AppImage', '.deb', '.exe', '.dmg'];
app.get('/api/downloads/info', (_req, res) => {
  try {
    if (!fs.existsSync(DOWNLOADS_DIR)) return res.json({ files: [] });
    const files = fs.readdirSync(DOWNLOADS_DIR)
      .filter(f => INSTALLER_EXTS.some(ext => f.endsWith(ext)))
      .map(f => {
        const stat = fs.statSync(path.join(DOWNLOADS_DIR, f));
        return {
          name: f,
          url: `/downloads/${encodeURIComponent(f)}`,
          sizeMB: Math.round(stat.size / 1024 / 1024 * 10) / 10,
          ext: INSTALLER_EXTS.find(ext => f.endsWith(ext)),
        };
      });
    res.json({ files });
  } catch {
    res.json({ files: [] });
  }
});

// ── Short-link redirects: /s/{short_code} → /onboarding/{token} ─────────────
app.get('/s/:code', onboardingViewLimiter, async (req: express.Request, res: express.Response) => {
  try {
    if (!/^[A-Za-z0-9]{4,16}$/.test(req.params.code)) return res.status(404).send('<h2>Link not found or has been revoked.</h2>');
    const row = await db('onboarding_tokens')
      .where({ short_code: req.params.code, is_revoked: false })
      .first();
    if (!row) return res.status(404).send('<h2>Link not found or has been revoked.</h2>');
    res.redirect(302, `/onboarding/${encodeURIComponent(row.token)}`);
  } catch { res.status(500).send('Server error'); }
});

// ── Onboarding (public form — no auth) ─────────────────────────────────────
app.use('/onboarding', onboardingRoutes);
// ── Onboarding admin API (authenticated, called from frontend) ───────────────
app.use('/api/onboarding', onboardingRoutes);

// ── Server info (public base URL used to build onboarding links) ───────────
// PUBLIC_URL wins; otherwise the URL this request arrived on (correct behind a
// proxy because of `trust proxy`). Authenticated: it is an internal detail.
app.get('/api/server-info', authenticate, (req, res) => {
  const baseUrl = config.publicUrl || `${req.protocol}://${req.get('host')}`;
  const url = new URL(baseUrl);
  res.json({
    ip: url.hostname,
    port: url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80),
    baseUrl,
  });
});

// ── Health check ─────────────────────────────────────────────────────────────
// Liveness: is the process up? (used by Docker/Railway health checks)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Readiness: can it reach the database? (for load balancers / uptime monitors)
app.get('/health/ready', async (_req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ status: 'ok', database: 'up' });
  } catch {
    res.status(503).json({ status: 'error', database: 'down' });
  }
});

// ── API Routes ────────────────────────────────────────────────────────────────
const api = '/api';
app.use(`${api}/auth`, authRoutes);
app.use(`${api}/employees/bulk-import`, bulkImportRoutes);
app.use(`${api}/employees`, employeesRoutes);
app.use(`${api}/employment`, employmentRoutes);
app.use(`${api}/transfers`, transfersRoutes);
app.use(`${api}/performance`, performanceRoutes);
app.use(`${api}/appraisal-templates`, appraisalTemplatesRoutes);
app.use(`${api}/staff-appraisals`, staffAppraisalsRoutes);
app.use(`${api}/training`, trainingRoutes);
app.use(`${api}/documents`, documentsRoutes);
app.use(`${api}/reports`, reportsRoutes);
app.use(`${api}/sync`, syncRoutes);
app.use(`${api}/users`, usersRoutes);
app.use(`${api}/campuses`,    campusesRoutes);
app.use(`${api}/job-titles`,  jobTitlesRoutes);
app.use(`${api}/classes`,     classesRoutes);
app.use(`${api}/staffing`,    staffingRoutes);
app.use(`${api}/attendance`,  attendanceRoutes);
app.use(`${api}/analytics`,   analyticsRoutes);
app.use(`${api}/academic-weeks`, academicWeeksRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
// Serve the React frontend for any non-API, non-onboarding route (SPA fallback)
const FRONTEND_DIST = config.paths.frontendDist
  ? path.resolve(config.paths.frontendDist)
  : path.resolve(__dirname, '../../desktop/dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST, { dotfiles: 'deny', index: false }));
  app.get(/^\/(?!api\/|onboarding\/|s\/|health|uploads\/|downloads\/).*/, (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler);

export default app;
