// Regenerates the extension PNG icons and the landing favicon from the source SVG.
// Run with: pnpm icons:generate
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const ICON_SVG = resolve(ROOT, 'assets/logo/icon.svg');
const EXTENSION_ICONS_DIR = resolve(ROOT, 'apps/extension/public/icons');
const WEB_FAVICON_SVG = resolve(ROOT, 'apps/web/public/favicon.svg');

const SIZES = [16, 32, 48, 128] as const;

async function main(): Promise<void> {
  mkdirSync(EXTENSION_ICONS_DIR, { recursive: true });
  mkdirSync(dirname(WEB_FAVICON_SVG), { recursive: true });

  const svgBuffer = readFileSync(ICON_SVG);

  for (const size of SIZES) {
    const outPath = resolve(EXTENSION_ICONS_DIR, `icon-${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    console.log(`✓ ${outPath}`);
  }

  copyFileSync(ICON_SVG, WEB_FAVICON_SVG);
  console.log(`✓ ${WEB_FAVICON_SVG}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
