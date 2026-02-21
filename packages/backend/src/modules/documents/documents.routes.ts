import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { authenticate, requirePermission } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { config } from '../../config';

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
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({
  storage,
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
      const filePath = path.resolve(config.upload.dir, doc.file_path);
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
      const filePath = path.resolve(config.upload.dir, doc.file_path);
      if (!fs.existsSync(filePath)) throw new AppError(404, 'File not found on disk');

      res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
      const disposition = req.query.download === '1' ? 'attachment' : 'inline';
      const safeName = encodeURIComponent(doc.title + path.extname(doc.file_path));
      res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
      res.sendFile(filePath);
    } catch (err) { next(err); }
  }
);

export default router;
