/**
 * generate-icons.js
 * Converts public/sak.jpg → platform icon files for electron-builder.
 * Run: node scripts/generate-icons.js
 */

const { Jimp }  = require('jimp');
const { default: pngToIco } = require('png-to-ico');
const path      = require('path');
const fs        = require('fs');

const DESKTOP = path.resolve(__dirname, '..');
const SRC     = path.join(DESKTOP, 'public', 'sak.jpg');
const ICONS   = path.join(DESKTOP, 'assets', 'icons');

if (!fs.existsSync(SRC)) { console.error('❌  sak.jpg not found at', SRC); process.exit(1); }
fs.mkdirSync(ICONS, { recursive: true });

async function makePng(base, size, name) {
  const dest = path.join(ICONS, name || (size + 'x' + size + '.png'));
  await base.clone().resize({ w: size, h: size }).write(dest);
  console.log('✅ ', path.basename(dest));
  return dest;
}

async function main() {
  const buf  = fs.readFileSync(SRC);
  const base = await Jimp.fromBuffer(buf);

  await makePng(base, 512);
  const p256 = await makePng(base, 256, 'icon.png');
  const p256b = await makePng(base, 256);
  const p128 = await makePng(base, 128);
  const p64  = await makePng(base, 64);
  const p32  = await makePng(base, 32);
  const p16  = await makePng(base, 16);

  const icoBuf = await pngToIco([p256b, p128, p64, p32, p16]);
  fs.writeFileSync(path.join(ICONS, 'icon.ico'), icoBuf);
  console.log('✅  icon.ico');
  console.log('\n📁  Done:', ICONS);
  console.log('\n⚠️  macOS: run on a Mac, then: iconutil -c icns icon.iconset -o assets/icons/icon.icns');
}

main().catch(e => { console.error('❌ ', e.message); process.exit(1); });
