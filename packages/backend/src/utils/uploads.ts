import path from 'path';
import type { Request } from 'express';
import type { FileFilterCallback } from 'multer';
import { AppError } from '../middleware/errorHandler';

/**
 * Upload safety rules.
 *
 * Uploaded staff documents (national IDs, contracts, passport photos) are user
 * supplied and are later served back from the API. Anything that a browser can
 * execute in our own origin (HTML, SVG, JS, XML) is therefore rejected at
 * upload time, and whatever does get stored is served with a hardened set of
 * response headers – see `documentResponseHeaders` below.
 */

/** mime type → canonical file extension. This doubles as the allow-list. */
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/pjpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/tiff': '.tif',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/plain': '.txt',
  'text/csv': '.csv',
};

/** Extensions accepted on the original filename, mirroring ALLOWED_TYPES. */
const ALLOWED_EXTENSIONS = new Set(Object.values(ALLOWED_TYPES).concat(['.jpeg', '.tiff']));

/** Types that are safe to render inline in a browser tab. Everything else downloads. */
const INLINE_SAFE_TYPES = new Set([
  'image/jpeg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

export const ALLOWED_UPLOAD_DESCRIPTION = 'images (JPG, PNG, WEBP, GIF, HEIC, TIFF), PDF, Word, Excel, TXT or CSV';

/**
 * Resolve the extension a stored file should get. Derived from the declared
 * mime type rather than the client supplied filename, so a caller cannot talk
 * us into writing `.html` to disk by naming their upload creatively.
 */
export function safeExtensionFor(mimeType: string, originalName = ''): string {
  const byMime = ALLOWED_TYPES[mimeType?.toLowerCase()];
  if (byMime) return byMime;
  const byName = path.extname(originalName).toLowerCase();
  return ALLOWED_EXTENSIONS.has(byName) ? byName : '.bin';
}

/** True when the mime type is on the allow-list. */
export function isAllowedUploadType(mimeType: string, originalName = ''): boolean {
  if (!ALLOWED_TYPES[mimeType?.toLowerCase()]) return false;
  const ext = path.extname(originalName).toLowerCase();
  // An empty extension is fine (camera captures, scans); a present one must match.
  return ext === '' || ALLOWED_EXTENSIONS.has(ext);
}

/** multer `fileFilter` enforcing the allow-list above. */
export function uploadFileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if (isAllowedUploadType(file.mimetype, file.originalname)) {
    cb(null, true);
    return;
  }
  cb(new AppError(415, `Unsupported file type "${file.mimetype}". Allowed: ${ALLOWED_UPLOAD_DESCRIPTION}`));
}

/**
 * Resolve a stored file path against the upload directory, refusing anything
 * that tries to escape it (`../`, absolute paths, NUL bytes).
 */
export function resolveStoredFile(uploadDir: string, storedPath: string): string {
  if (!storedPath || storedPath.includes('\0')) throw new AppError(400, 'Invalid file reference');
  // Stored paths are always bare filenames we generated; strip any directory part.
  const base = path.basename(storedPath);
  const root = path.resolve(uploadDir);
  const resolved = path.resolve(root, base);
  if (resolved !== path.join(root, base)) throw new AppError(400, 'Invalid file reference');
  return resolved;
}

/**
 * Response headers for serving a stored document.
 *
 * `nosniff` stops the browser second-guessing our Content-Type, and anything
 * outside the inline-safe list is forced to download so it can never execute in
 * the app's origin.
 */
export function documentResponseHeaders(opts: {
  mimeType: string | null | undefined;
  fileName: string;
  forceDownload?: boolean;
}): Record<string, string> {
  const mime = (opts.mimeType || '').toLowerCase();
  const canInline = INLINE_SAFE_TYPES.has(mime);
  const disposition = opts.forceDownload || !canInline ? 'attachment' : 'inline';
  return {
    'Content-Type': canInline ? mime : 'application/octet-stream',
    'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(opts.fileName)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, no-store',
  };
}
