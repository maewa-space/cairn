#!/usr/bin/env node
// Builds the Quill app icon: SVG → PNG iconset → icon.icns + icon.png.
// Renders the source SVG via headless Chromium (Playwright) so we don't depend
// on rsvg-convert / ImageMagick / sharp / inkscape being installed.

import { chromium } from 'playwright';
import { writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const buildDir = join(root, 'build');
const iconsetDir = join(buildDir, 'icon.iconset');

const PAPER = '#f1e7d2';
const PAPER_LIGHT = '#fbf5e6';
const PAPER_EDGE = '#e3d4ae';
const INK = '#1d2a17';
const INK_DOT = '#2f5b2a';

// Typographic logo: italic serif "Q" on warm paper. The Q monogram ties the
// mark directly to the product name and reads cleanly at 16px. Newsreader is
// loaded from Google Fonts in the rendering HTML; Georgia is the fallback.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="paper" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="${PAPER_LIGHT}"/>
      <stop offset="100%" stop-color="${PAPER}"/>
    </linearGradient>
    <radialGradient id="vignette" cx="50%" cy="50%" r="65%">
      <stop offset="60%" stop-color="${PAPER_LIGHT}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${PAPER_EDGE}" stop-opacity="0.5"/>
    </radialGradient>
  </defs>

  <rect width="1024" height="1024" rx="220" fill="url(#paper)"/>
  <rect width="1024" height="1024" rx="220" fill="url(#vignette)"/>

  <g>
    <text x="512" y="760"
          font-family="Newsreader, 'Source Serif Pro', Georgia, 'Times New Roman', serif"
          font-style="italic" font-weight="500"
          font-size="820" letter-spacing="-12"
          text-anchor="middle" fill="${INK}">Q</text>
  </g>

  <circle cx="850" cy="860" r="28" fill="${INK_DOT}" opacity="0.85"/>
</svg>`;

const sizes = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
];

async function main() {
  await mkdir(buildDir, { recursive: true });
  if (existsSync(iconsetDir)) await rm(iconsetDir, { recursive: true, force: true });
  await mkdir(iconsetDir, { recursive: true });

  await writeFile(join(buildDir, 'icon.svg'), SVG, 'utf-8');

  const browser = await chromium.launch();
  try {
    for (const { name, size } of sizes) {
      const html = `<!doctype html><html><head><meta charset="utf-8"/>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
        <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@1,500&display=block" rel="stylesheet"/>
        <style>
          html,body{margin:0;padding:0;background:transparent;}
          svg{display:block;}
        </style>
      </head><body>${SVG.replace(
        '<svg xmlns="http://www.w3.org/2000/svg"',
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"`,
      )}</body></html>`;

      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });
      await page.setContent(html);
      // Wait for the web font to load so the Q renders in Newsreader, not the fallback.
      await page
        .evaluate(async () => {
          if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
          }
        })
        .catch(() => undefined);
      const buf = await page.locator('svg').screenshot({
        omitBackground: true,
        type: 'png',
      });
      await page.close();
      await writeFile(join(iconsetDir, name), buf);
      process.stdout.write(`  ${name} (${size}px)\n`);
    }
  } finally {
    await browser.close();
  }

  execSync(`iconutil -c icns "${iconsetDir}" -o "${join(buildDir, 'icon.icns')}"`, {
    stdio: 'inherit',
  });

  // High-res marketing PNG copy
  await copyFile(
    join(iconsetDir, 'icon_512x512@2x.png'),
    join(buildDir, 'icon.png'),
  );

  // Also save README-friendly mid-res copies for docs
  const docsDir = join(root, 'docs');
  await mkdir(docsDir, { recursive: true });
  await copyFile(join(iconsetDir, 'icon_256x256.png'), join(docsDir, 'icon-256.png'));
  await copyFile(join(iconsetDir, 'icon_512x512.png'), join(docsDir, 'icon-512.png'));

  console.log('\n✓ build/icon.icns');
  console.log('✓ build/icon.png (1024×1024)');
  console.log('✓ build/icon.svg (source)');
  console.log('✓ docs/icon-256.png, docs/icon-512.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
