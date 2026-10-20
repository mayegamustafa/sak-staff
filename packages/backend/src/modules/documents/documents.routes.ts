import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { config } from '../../config';
import {
  uploadFileFilter,
  safeExtensionFor,
  isAllowedUploadType,
  resolveStoredFile,
  documentResponseHeaders,
  ALLOWED_UPLOAD_DESCRIPTION,
} from '../../utils/uploads';

const router = Router();
router.use(authenticate);

// Multer config
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.resolve(config.upload.dir);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    // Extension comes from the declared mime type, never from the client filename.
    cb(null, `${uuidv4()}${safeExtensionFor(file.mimetype, file.originalname)}`);
  },
});
const upload = multer({
  storage,
  fileFilter: uploadFileFilter,
  limits: { fileSize: config.upload.maxSizeMB * 1024 * 1024 },
});

// GET /api/documents?employeeId=&category=
router.get('/', requirePermission('documents', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let query = db('documents').orderBy('created_at', 'desc');
      if (req.query.employeeId) query = query.where('employee_id', req.query.employeeId as string);
      if (req.query.category) query = query.where('category', req.query.category as string);
      res.json(await query);
    } catch (err) { next(err); }
  }
);

// POST /api/documents  (multipart upload)
router.post('/', requirePermission('documents', 'create'),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new AppError(400, 'No file uploaded');
      const { employeeId, category, title, issuedDate, expiryDate, notes } = req.body;
      if (!employeeId || !category || !title) throw new AppError(400, 'employeeId, category and title are required');

      const [doc] = await db('documents').insert({
        id: uuidv4(),
        employee_id: employeeId,
        category,
        title,
        file_path: req.file.filename,
        mime_type: req.file.mimetype,
        file_size_bytes: req.file.size,
        uploaded_by: req.user!.userId,
        issued_date: issuedDate || null,
        expiry_date: expiryDate || null,
        notes: notes || null,
      }).returning('*');

      res.status(201).json(doc);
    } catch (err) { next(err); }
  }
);

// DELETE /api/documents/:id
router.delete('/:id', requirePermission('documents', 'delete'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await db('documents').where('id', req.params.id).first();
      if (!doc) throw new AppError(404, 'Document not found');
      // Remove file from disk
      const filePath = resolveStoredFile(config.upload.dir, doc.file_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await db('documents').where('id', req.params.id).del();
      res.status(204).send();
    } catch (err) { next(err); }
  }
);

// GET /api/documents/:id/file  – serve the actual file inline
router.get('/:id/file', requirePermission('documents', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await db('documents').where('id', req.params.id).first();
      if (!doc) throw new AppError(404, 'Document not found');
      const filePath = resolveStoredFile(config.upload.dir, doc.file_path);
      if (!fs.existsSync(filePath)) throw new AppError(404, 'File not found on disk');

      res.set(documentResponseHeaders({
        mimeType: doc.mime_type,
        fileName: doc.title + path.extname(doc.file_path),
        forceDownload: req.query.download === '1',
      }));
      res.sendFile(filePath);
    } catch (err) { next(err); }
  }
);

// ── Scanner (SANE / scanimage) ───────────────────────────────────────────────

// GET /api/documents/scanners  – list available SANE devices
router.get('/scanners', requirePermission('documents', 'create'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      execFile('scanimage', ['-L'], { timeout: 8000 }, (err, stdout, stderr) => {
        if (err) {
          // scanimage not installed or no scanner found
          return res.json({ scanners: [], error: stderr?.trim() || 'scanimage not available' });
        }
        // Parse lines like: device `hpaio:/net/HP_OfficeJet?zc=...' is a HP OfficeJet ...
        const lines = stdout.split('\n').filter(l => l.startsWith('device'));
        const scanners = lines.map((l) => {
          const m = l.match(/`([^']+)'/);
          const name = l.replace(/^device\s+`[^']+'\s+is\s+a\s+/i, '').trim();
          return { device: m?.[1] ?? l, name };
        });
        res.json({ scanners });
      });
    } catch (err) { next(err); }
  }
);

// POST /api/documents/scan  – trigger a scan and save as document
router.post('/scan', requirePermission('documents', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { employeeId, category, title, device, resolution = '300', format = 'jpeg' } = req.body;
      if (!employeeId || !category || !title) {
        throw new AppError(400, 'employeeId, category and title are required');
      }
      if (!/^\d{2,4}$/.test(String(resolution))) throw new AppError(400, 'Invalid scan resolution');

      const dir = path.resolve(config.upload.dir);
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${uuidv4()}.${format === 'png' ? 'png' : 'jpg'}`;
      const outPath  = path.join(dir, filename);

      const args = [
        '--format=' + (format === 'png' ? 'png' : 'jpeg'),
        '--resolution=' + resolution,
        '--output-file=' + outPath,
      ];
      if (device) args.unshift('--device-name=' + device);

      execFile('scanimage', args, { timeout: 60_000 }, async (err, _stdout, stderr) => {
        if (err) {
          if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
          return next(new AppError(502, `Scan failed: ${stderr?.trim() || err.message}`));
        }
        try {
          const stat = fs.statSync(outPath);
          const mime = format === 'png' ? 'image/png' : 'image/jpeg';
          const [doc] = await db('documents').insert({
            id:              uuidv4(),
            employee_id:     employeeId,
            category,
            title,
            file_path:       filename,
            mime_type:       mime,
            file_size_bytes: stat.size,
            uploaded_by:     req.user!.userId,
          }).returning('*');
          res.status(201).json(doc);
        } catch (dbErr) { next(dbErr); }
      });
    } catch (err) { next(err); }
  }
);

// POST /api/documents/upload-base64  – upload a base64-encoded blob (webcam capture)
router.post('/upload-base64', requirePermission('documents', 'create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { employeeId, category, title, dataUrl, issuedDate, expiryDate } = req.body;
      if (!employeeId || !category || !title || !dataUrl) {
        throw new AppError(400, 'employeeId, category, title and dataUrl are required');
      }
      const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) throw new AppError(400, 'Invalid data URL');
      const mime    = matches[1] as string;
      if (!isAllowedUploadType(mime)) {
        throw new AppError(415, `Unsupported file type "${mime}". Allowed: ${ALLOWED_UPLOAD_DESCRIPTION}`);
      }
      const buffer  = Buffer.from(matches[2], 'base64');
      if (buffer.length > config.upload.maxSizeMB * 1024 * 1024) {
        throw new AppError(413, `File too large (max ${config.upload.maxSizeMB}MB)`);
      }
      const filename = `${uuidv4()}${safeExtensionFor(mime)}`;
      const dir = path.resolve(config.upload.dir);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), buffer);

      const [doc] = await db('documents').insert({
        id:              uuidv4(),
        employee_id:     employeeId,
        category,
        title,
        file_path:       filename,
        mime_type:       mime,
        file_size_bytes: buffer.length,
        uploaded_by:     req.user!.userId,
        issued_date:     issuedDate || null,
        expiry_date:     expiryDate || null,
      }).returning('*');

      res.status(201).json(doc);
    } catch (err) { next(err); }
  }
);

export default router;
