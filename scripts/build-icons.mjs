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

// Final direction (chosen 2026-05-09): a confident Didone Q in cream on a
// deep forest field. Picked from a 12-design portfolio + 10-color palette
// review. The forest pulls darker and bluer than the prior moss so the icon
// reads as ink-on-stock rather than acidic spring green.
//
// Token mirror: --moss in tokens.css is set to the same forest hue so the
// in-app drop cap, active borders, and brand mark match the Dock icon.
const FOREST = '#1f3a2c'; // primary
const FOREST_DEEP = '#11241c'; // shadowed corner of the squircle
const PAPER = '#FFFCF6'; // Apple Notes-style warm white for the cream Q

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="forest-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${FOREST}"/>
      <stop offset="100%" stop-color="${FOREST_DEEP}"/>
    </linearGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <clipPath id="squircle">
      <rect width="1024" height="1024" rx="232"/>
    </clipPath>
  </defs>

  <g clip-path="url(#squircle)">
    <!-- Forest squircle with subtle gradient. -->
    <rect width="1024" height="1024" fill="url(#forest-bg)"/>
    <!-- Quiet paper-grain noise so the surface has texture, not vector flatness. -->
    <rect width="1024" height="1024" filter="url(#grain)" opacity="0.35"/>
  </g>

  <!-- Cream Didone Q. Playfair Display 900 at full bleed; the high-contrast
       thicks/thins, the elegant tail, and the cream-on-forest contrast give
       the icon real type personality. -->
  <text x="512" y="800"
        font-family="'Playfair Display', 'Bodoni 72', Georgia, 'Times New Roman', serif"
        font-style="normal" font-weight="900"
        font-size="950" letter-spacing="-40"
        text-anchor="middle" fill="${PAPER}">Q</text>
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
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@900&display=block" rel="stylesheet"/>
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
      // Wait for the web font to land so the Q renders in Playfair Display
      // rather than Times. Letter shapes diverge significantly between the two.
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
