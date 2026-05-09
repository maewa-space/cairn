#!/usr/bin/env node
// Color exploration for the two finalist directions:
//   A. Italic swash Q on cream paper (mark = chosen color)
//   B. Didone Q on solid color field (mark = cream)
// Renders both treatments per palette color into ~/Downloads/quill-icon-options/colors/
// plus a single contact sheet for side-by-side review.

import { chromium } from 'playwright';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const outDir = join(homedir(), 'Downloads', 'quill-icon-options', 'colors');

// Apple Notes paper — very subtle warm white, much lighter than the prior
// cream. Sampled from macOS Notes light-mode default background. Using a
// barely-perceptible gradient so the surface still has dimension at large
// sizes but reads as "white" at icon sizes.
const PAPER = '#FFFCF6';
const PAPER_DEEP = '#FAF6E8';
const INK = '#2c2820';

const fontImports = `
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400..800;1,400..800&family=Playfair+Display:wght@400..900&family=JetBrains+Mono:wght@500&display=block" rel="stylesheet"/>
`;

// Curated literary palette. Each entry: name shown to user, primary fill,
// deeper shade for the moss-style background gradient. No bright/neon —
// editorial, leather-bound-book register.
const COLORS = [
  {
    id: 'ink',
    label: 'Ink black',
    notes: 'Classic literary. Pure printing ink, max contrast.',
    primary: '#1a1814',
    deep: '#0d0a05',
  },
  {
    id: 'slate',
    label: 'Slate charcoal',
    notes: 'Modernist editorial. Cool, neutral, technical.',
    primary: '#2c323d',
    deep: '#1d2129',
  },
  {
    id: 'midnight',
    label: 'Midnight navy',
    notes: 'Publication blue. The Atlantic, Granta.',
    primary: '#1c2a47',
    deep: '#0d1a30',
  },
  {
    id: 'indigo',
    label: 'Indigo',
    notes: 'Literary indigo — quiet, contemplative.',
    primary: '#2c2e5e',
    deep: '#1a1a3d',
  },
  {
    id: 'oxblood',
    label: 'Oxblood',
    notes: 'Deep wine. Refined, slightly cinematic.',
    primary: '#5b1f23',
    deep: '#3d1318',
  },
  {
    id: 'bordeaux',
    label: 'Bordeaux',
    notes: 'Richer wine red. Warmth + authority.',
    primary: '#7a1c2e',
    deep: '#54101f',
  },
  {
    id: 'cognac',
    label: 'Cognac',
    notes: 'Leather-bound book. Warm, lived-in.',
    primary: '#8a4d1f',
    deep: '#5e3414',
  },
  {
    id: 'terracotta',
    label: 'Terracotta',
    notes: 'Warm clay. Earthy editorial, unexpected.',
    primary: '#a64422',
    deep: '#7a2e15',
  },
  {
    id: 'aubergine',
    label: 'Aubergine',
    notes: 'Sophisticated plum. Luxurious + restrained.',
    primary: '#3e1f3a',
    deep: '#28132a',
  },
  {
    id: 'forest',
    label: 'Forest (deeper green)',
    notes: 'Less acidic than the current moss — pulled darker + bluer.',
    primary: '#1f3a2c',
    deep: '#11241c',
  },
];

const DEFS_FOR = (color) => `
<defs>
  <linearGradient id="bg-color" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${color.primary}"/>
    <stop offset="100%" stop-color="${color.deep}"/>
  </linearGradient>
  <linearGradient id="paper-bg" x1="0.5" y1="0" x2="0.5" y2="1">
    <stop offset="0%" stop-color="${PAPER}"/>
    <stop offset="100%" stop-color="${PAPER_DEEP}"/>
  </linearGradient>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4"/>
    <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="grain-paper" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7"/>
    <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <clipPath id="squircle">
    <rect width="1024" height="1024" rx="232"/>
  </clipPath>
</defs>
`;

// (A) Italic swash Q on cream paper — mark in the chosen color.
const italicSvg = (color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
${DEFS_FOR(color)}
<g clip-path="url(#squircle)">
  <rect width="1024" height="1024" fill="url(#paper-bg)"/>
  <rect width="1024" height="1024" filter="url(#grain-paper)" opacity="0.4"/>
  <text x="510" y="780"
    font-family="'Newsreader', Georgia, serif"
    font-style="italic" font-weight="600" font-size="940" letter-spacing="-26"
    text-anchor="middle" fill="${color.primary}">Q</text>
</g>
</svg>`;

// (B) Didone Q on solid color — mark in cream.
const didoneSvg = (color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
${DEFS_FOR(color)}
<g clip-path="url(#squircle)">
  <rect width="1024" height="1024" fill="url(#bg-color)"/>
  <rect width="1024" height="1024" filter="url(#grain)" opacity="0.35"/>
  <text x="512" y="800"
    font-family="'Playfair Display', 'Bodoni 72', serif"
    font-weight="900" font-size="950" letter-spacing="-40"
    text-anchor="middle" fill="${PAPER}">Q</text>
</g>
</svg>`;

async function main() {
  if (existsSync(outDir)) await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const color of COLORS) {
      for (const [variant, svgFn] of [
        ['italic', italicSvg],
        ['didone', didoneSvg],
      ]) {
        const svg = svgFn(color);
        const html = `<!doctype html><html><head><meta charset="utf-8"/>
          ${fontImports}
          <style>
            html,body{margin:0;padding:0;background:transparent;}
            svg{display:block;}
          </style>
        </head><body>${svg.replace(
          '<svg xmlns="http://www.w3.org/2000/svg"',
          `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"`,
        )}</body></html>`;

        const page = await browser.newPage({
          viewport: { width: 1024, height: 1024 },
          deviceScaleFactor: 1,
        });
        await page.setContent(html);
        await page
          .evaluate(async () => {
            if (document.fonts && document.fonts.ready) {
              await document.fonts.ready;
            }
          })
          .catch(() => undefined);
        await new Promise((r) => setTimeout(r, 80));
        const buf = await page.locator('svg').screenshot({
          omitBackground: true,
          type: 'png',
        });
        await page.close();
        await writeFile(
          join(outDir, `${color.id}-${variant}.png`),
          buf,
        );
        process.stdout.write(`  ${color.id}-${variant}.png\n`);
      }
    }

    // Contact sheet — one row per color, 2 tiles + label.
    const sheetHtml = `<!doctype html><html><head><meta charset="utf-8"/>
      ${fontImports}
      <style>
        html, body { margin: 0; padding: 0; background: ${PAPER}; }
        body {
          font-family: 'Newsreader', Georgia, serif;
          color: ${INK};
          padding: 48px 56px 64px;
        }
        .head { margin-bottom: 28px; }
        .eyebrow {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px; letter-spacing: 0.18em;
          text-transform: uppercase; color: #5e564a; opacity: 0.7;
          margin-bottom: 6px;
        }
        h1 {
          font-size: 36px; font-weight: 600;
          margin: 0 0 6px; letter-spacing: -0.022em;
        }
        .lede { font-style: italic; color: #5e564a; max-width: 64ch; line-height: 1.5; }
        hr.rule { border: 0; border-top: 1px solid #d4d2c9; margin: 22px 0; }
        .row {
          display: grid;
          grid-template-columns: 220px 1fr 1fr;
          gap: 32px;
          padding: 22px 0;
          border-bottom: 1px solid #ece9dd;
          align-items: center;
        }
        .label .name { font-size: 22px; font-weight: 600; letter-spacing: -0.014em; }
        .label .hex {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px; letter-spacing: 0.08em;
          color: #5e564a; margin-top: 4px;
        }
        .label .notes {
          font-size: 13px; color: #7a7060; font-style: italic;
          line-height: 1.45; margin-top: 8px; max-width: 22ch;
        }
        .swatch {
          display: inline-block; width: 14px; height: 14px;
          border-radius: 4px; vertical-align: middle;
          margin-right: 8px; border: 1px solid #d4d2c9;
        }
        .tile {
          width: 100%; aspect-ratio: 1 / 1;
          border-radius: 24px; overflow: hidden;
          border: 1px solid #d4d2c9;
        }
        .tile svg { width: 100%; height: 100%; display: block; }
        .col-head {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10.5px; letter-spacing: 0.16em;
          text-transform: uppercase; color: #5e564a;
          padding: 0 0 10px;
        }
      </style>
    </head><body>
      <header class="head">
        <div class="eyebrow">QUILL — COLOR PALETTE</div>
        <h1>Same mark, ten registers.</h1>
        <p class="lede">Italic-swash Q on cream paper (left column) and Didone Q on a solid field (right column), across ten editorial palettes. Each row holds the color steady so you can compare treatments. Forest at the bottom is a darker, less acidic version of the current moss.</p>
        <hr class="rule"/>
        <div class="row" style="border-bottom: none; padding: 0;">
          <div></div>
          <div class="col-head">A · Italic swash on paper</div>
          <div class="col-head">B · Didone on solid</div>
        </div>
      </header>
      ${COLORS.map(
        (c) => `
        <section class="row">
          <div class="label">
            <div class="name">
              <span class="swatch" style="background:${c.primary}"></span>
              ${c.label}
            </div>
            <div class="hex">${c.primary.toUpperCase()} · ${c.deep.toUpperCase()}</div>
            <div class="notes">${c.notes}</div>
          </div>
          <div class="tile">${italicSvg(c)}</div>
          <div class="tile">${didoneSvg(c)}</div>
        </section>`,
      ).join('')}
    </body></html>`;

    const sheetPage = await browser.newPage({
      viewport: { width: 1600, height: 1200 },
      deviceScaleFactor: 1,
    });
    await sheetPage.setContent(sheetHtml);
    await sheetPage
      .evaluate(async () => {
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }
      })
      .catch(() => undefined);
    await new Promise((r) => setTimeout(r, 200));
    const sheetBuf = await sheetPage.screenshot({
      fullPage: true,
      type: 'png',
    });
    await sheetPage.close();
    await writeFile(join(outDir, '00-palette.png'), sheetBuf);
    process.stdout.write('  00-palette.png — comparison sheet\n');
  } finally {
    await browser.close();
  }

  console.log(`\n✓ ${COLORS.length} colors × 2 treatments + comparison sheet`);
  console.log(`✓ ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
