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

const PAPER = '#f4ebd6';
const PAPER_LIGHT = '#fbf3e1';
const INK = '#2f5b2a';
const INK_LIGHT = '#5a8a4c';
const NIB = '#1d3819';

// 24x24 viewBox so the lucide-style paths align cleanly.
// We layer: warm paper rounded-rect background → filled feather body
// → outlined feather strokes → small ink-drop accent in lower-right.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${PAPER_LIGHT}"/>
      <stop offset="100%" stop-color="${PAPER}"/>
    </linearGradient>
    <linearGradient id="ink" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${INK_LIGHT}"/>
      <stop offset="100%" stop-color="${INK}"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="24" height="24" rx="5.2" fill="url(#paper)"/>

  <g transform="translate(0.4 0.2)">
    <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"
          fill="url(#ink)" fill-opacity="0.92"
          stroke="${NIB}" stroke-width="0.55"
          stroke-linejoin="round"/>
    <path d="M16 8 2 22"
          stroke="${NIB}" stroke-width="0.85"
          stroke-linecap="round" fill="none"/>
    <path d="M17.5 15H9"
          stroke="${PAPER_LIGHT}" stroke-width="0.55"
          stroke-linecap="round" fill="none" opacity="0.85"/>
  </g>

  <circle cx="20.4" cy="20.4" r="0.85" fill="${INK}" opacity="0.9"/>
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
      const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
        html,body{margin:0;padding:0;background:transparent;}
        svg{display:block;}
      </style></head><body>${SVG.replace(
        '<svg xmlns="http://www.w3.org/2000/svg"',
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"`,
      )}</body></html>`;

      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });
      await page.setContent(html);
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
