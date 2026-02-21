#!/usr/bin/env node
/**
 * Post-build: copy the latest desktop installer into packages/backend/downloads/
 * so the backend can serve it directly for in-app downloads.
 *
 * Keeps only the newest file per platform type to avoid accumulating old builds.
 * Supported extensions: .AppImage  .deb  .exe
 */
const fs   = require('fs');
const path = require('path');

const RELEASE_DIR   = path.join(__dirname, '..', 'release');
const DOWNLOADS_DIR = path.join(__dirname, '..', '..', 'backend', 'downloads');

const EXTENSIONS = ['.AppImage', '.deb', '.exe', '.dmg'];

if (!fs.existsSync(RELEASE_DIR)) {
  console.log('[copy-installer] No release/ directory found – skipping.');
  process.exit(0);
}

fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

// Collect candidate files
const files = fs.readdirSync(RELEASE_DIR)
  .filter(f => EXTENSIONS.some(ext => f.endsWith(ext)))
  .map(f => ({
    name: f,
    full: path.join(RELEASE_DIR, f),
    mtime: fs.statSync(path.join(RELEASE_DIR, f)).mtimeMs,
    ext: EXTENSIONS.find(ext => f.endsWith(ext)),
  }))
  .sort((a, b) => b.mtime - a.mtime);  // newest first

if (files.length === 0) {
  console.log('[copy-installer] No installer files found in release/');
  process.exit(0);
}

// Clean old installers from downloads dir
const existing = fs.readdirSync(DOWNLOADS_DIR);
existing.forEach(f => {
  if (EXTENSIONS.some(ext => f.endsWith(ext))) {
    fs.unlinkSync(path.join(DOWNLOADS_DIR, f));
    console.log(`[copy-installer] Removed old: ${f}`);
  }
});

// Copy one per platform extension
const copied = new Set();
for (const file of files) {
  if (copied.has(file.ext)) continue;
  fs.copyFileSync(file.full, path.join(DOWNLOADS_DIR, file.name));
  console.log(`[copy-installer] Copied → backend/downloads/${file.name}`);
  copied.add(file.ext);
}

console.log('[copy-installer] Done.');
