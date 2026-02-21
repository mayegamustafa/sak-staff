import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';

// Route modules
import authRoutes from './modules/auth/auth.routes';
import employeesRoutes from './modules/employees/employees.routes';
import employmentRoutes from './modules/employment/employment.routes';
import transfersRoutes from './modules/transfers/transfers.routes';
import performanceRoutes from './modules/performance/performance.routes';
import trainingRoutes from './modules/training/training.routes';
import documentsRoutes from './modules/documents/documents.routes';
import reportsRoutes from './modules/reports/reports.routes';
import syncRoutes from './modules/sync/sync.routes';
import usersRoutes from './modules/users/users.routes';
import campusesRoutes  from './modules/campuses/campuses.routes';
import jobTitlesRoutes from './modules/job-titles/job-titles.routes';
import classesRoutes   from './modules/classes/classes.routes';
import staffingRoutes  from './modules/staffing/staffing.routes';

const app = express();

// ── Security ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: config.cors.origins, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: 'Too many requests' }));

// ── Body / Compression ───────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ── Static files (uploaded documents) ───────────────────────────────────────
app.use('/uploads', express.static(path.resolve(config.upload.dir)));

// ── Desktop installer downloads (served without auth) ────────────────────────
const DOWNLOADS_DIR = path.resolve(__dirname, '../../downloads');
app.use('/downloads', express.static(DOWNLOADS_DIR));

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

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    system: 'SAK Staff Profiling System',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
const api = '/api';
app.use(`${api}/auth`, authRoutes);
app.use(`${api}/employees`, employeesRoutes);
app.use(`${api}/employment`, employmentRoutes);
app.use(`${api}/transfers`, transfersRoutes);
app.use(`${api}/performance`, performanceRoutes);
app.use(`${api}/training`, trainingRoutes);
app.use(`${api}/documents`, documentsRoutes);
app.use(`${api}/reports`, reportsRoutes);
app.use(`${api}/sync`, syncRoutes);
app.use(`${api}/users`, usersRoutes);
app.use(`${api}/campuses`,    campusesRoutes);
app.use(`${api}/job-titles`,  jobTitlesRoutes);
app.use(`${api}/classes`,     classesRoutes);
app.use(`${api}/staffing`,    staffingRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler);

export default app;
