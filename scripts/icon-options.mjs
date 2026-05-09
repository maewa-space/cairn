#!/usr/bin/env node
// Generate a portfolio of icon design directions for Quill so the user can
// react and pick. Renders each SVG at 1024×1024 via headless Chromium (same
// pipeline as build-icons.mjs) and writes to ~/Downloads/quill-icon-options/.
// Also produces a contact-sheet.png with all 12 in a labeled grid.

import { chromium } from 'playwright';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const outDir = join(homedir(), 'Downloads', 'quill-icon-options');

const PAPER = '#fdfcf7';
const PAPER_DEEP = '#f3eedc';
// Synced with the chosen brand: deep forest. If you re-run this script to
// generate fresh exploration tiles, they'll match the in-app + Dock icon.
const MOSS = '#1f3a2c';
const MOSS_DEEP = '#11241c';
const INK = '#2c2820';

const fontImports = `
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400..800;1,400..800&family=Playfair+Display:wght@400..900&family=DM+Serif+Display&family=IBM+Plex+Serif:wght@500;700&family=Crimson+Pro:wght@400..900&family=JetBrains+Mono:wght@500;700&display=block" rel="stylesheet"/>
`;

// Reusable defs (paper gradient, moss gradient, grain filter, squircle clip)
const DEFS = `
<defs>
  <linearGradient id="moss-bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${MOSS}"/>
    <stop offset="100%" stop-color="${MOSS_DEEP}"/>
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

// Reusable squircle base layers — moss tile with subtle grain.
const mossTile = `
  <rect width="1024" height="1024" fill="url(#moss-bg)"/>
  <rect width="1024" height="1024" filter="url(#grain)" opacity="0.35"/>
`;
const paperTile = `
  <rect width="1024" height="1024" fill="url(#paper-bg)"/>
  <rect width="1024" height="1024" filter="url(#grain-paper)" opacity="0.4"/>
`;

// SVG wrapper with the squircle clip applied.
const wrap = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
${DEFS}
<g clip-path="url(#squircle)">
${inner}
</g>
</svg>`;

// ------------------------------------------------------------------
// 12 designs
// ------------------------------------------------------------------

const DESIGNS = [
  {
    id: '01-press-solid-Q',
    title: 'Press — solid Q',
    description:
      'Big upright serif Q, cream on moss. No chrome, no inset. Maximum confidence at small sizes.',
    svg: wrap(`
      ${mossTile}
      <text x="512" y="780"
        font-family="'Newsreader', Georgia, serif"
        font-weight="700" font-size="900" letter-spacing="-30"
        text-anchor="middle" fill="${PAPER}">Q</text>
    `),
  },
  {
    id: '02-didone-Q',
    title: 'Didone Q',
    description:
      'High-contrast Playfair Display Q at 900 weight. Modern editorial; reads like a magazine title page.',
    svg: wrap(`
      ${mossTile}
      <text x="512" y="800"
        font-family="'Playfair Display', 'Bodoni 72', serif"
        font-weight="900" font-size="950" letter-spacing="-40"
        text-anchor="middle" fill="${PAPER}">Q</text>
    `),
  },
  {
    id: '03-italic-swash-Q',
    title: 'Italic swash Q',
    description:
      'Calligraphic Newsreader italic at 600. The swash tail extends past the baseline — handwritten energy.',
    svg: wrap(`
      ${paperTile}
      <text x="510" y="780"
        font-family="'Newsreader', Georgia, serif"
        font-style="italic" font-weight="600" font-size="940" letter-spacing="-26"
        text-anchor="middle" fill="${MOSS}">Q</text>
    `),
  },
  {
    id: '04-monogram-Q',
    title: 'Monogram — rule through Q',
    description:
      'Big Q with a horizontal hairline rule slicing through it. Logotype move; reads as a mark not a letter.',
    svg: wrap(`
      ${mossTile}
      <rect x="120" y="100" width="784" height="824" rx="148" fill="${PAPER}"/>
      <text x="512" y="780"
        font-family="'Newsreader', Georgia, serif"
        font-weight="700" font-size="820" letter-spacing="-26"
        text-anchor="middle" fill="${MOSS}">Q</text>
      <line x1="120" y1="540" x2="904" y2="540"
            stroke="${MOSS}" stroke-width="6" stroke-opacity="0.92"/>
    `),
  },
  {
    id: '05-nib',
    title: 'Quill nib',
    description:
      'Custom-drawn calligraphic nib. Clean geometric form: nib body, slit, breather hole. No letter.',
    svg: wrap(`
      ${paperTile}
      <!-- Nib silhouette: pointed tip downward, breather hole, slit. -->
      <g transform="translate(512 540)">
        <path d="M 0 -360
                 L 240 100
                 L 200 280
                 L 0 460
                 L -200 280
                 L -240 100
                 Z"
              fill="${MOSS}"
              stroke="${MOSS_DEEP}" stroke-width="6"
              stroke-linejoin="round"/>
        <!-- Slit running from breather to tip -->
        <line x1="0" y1="-40" x2="0" y2="450"
              stroke="${PAPER}" stroke-width="14" stroke-linecap="round"/>
        <!-- Breather hole -->
        <circle cx="0" cy="-90" r="44" fill="${PAPER}"/>
        <!-- Tip highlight -->
        <path d="M -60 360 L 0 460 L 60 360 Z" fill="${MOSS_DEEP}"/>
      </g>
    `),
  },
  {
    id: '06-inkwell-stroke',
    title: 'Inkwell + stroke',
    description:
      'Tiny inkwell at the foot, long brushy ink-stroke rising. The action of writing, not the letter.',
    svg: wrap(`
      ${paperTile}
      <!-- Brushy stroke arcing up + curving back -->
      <path d="M 460 880
               C 380 700 300 540 380 380
               C 460 240 620 180 720 280
               C 800 360 760 480 680 540
               C 580 620 480 600 460 540"
            fill="none"
            stroke="${MOSS}" stroke-width="62" stroke-linecap="round"
            stroke-linejoin="round"/>
      <!-- Inkwell base -->
      <ellipse cx="460" cy="900" rx="180" ry="36" fill="${MOSS_DEEP}"/>
      <ellipse cx="460" cy="884" rx="160" ry="30" fill="${MOSS}"/>
      <ellipse cx="460" cy="884" rx="100" ry="14" fill="${INK}"/>
    `),
  },
  {
    id: '07-pilcrow',
    title: 'Pilcrow ¶',
    description:
      'Editorial paragraph mark. Says "writing" without saying "Q". Bold serif on cream.',
    svg: wrap(`
      ${paperTile}
      <text x="512" y="800"
        font-family="'Crimson Pro', 'Newsreader', Georgia, serif"
        font-weight="700" font-size="780" letter-spacing="-10"
        text-anchor="middle" fill="${MOSS}">¶</text>
    `),
  },
  {
    id: '08-ampersand',
    title: 'Ampersand &amp;',
    description:
      'Italic ampersand — typographer-favorite glyph. Personality without literalism.',
    svg: wrap(`
      ${mossTile}
      <text x="512" y="780"
        font-family="'Playfair Display', 'Newsreader', Georgia, serif"
        font-style="italic" font-weight="700" font-size="820" letter-spacing="-18"
        text-anchor="middle" fill="${PAPER}">&amp;</text>
    `),
  },
  {
    id: '09-issue-no-1',
    title: 'Issue No. 1',
    description:
      'Mono "№ 1" sequence. Editorial publication mark — not a letter. Suggests volumes, issues, dispatches.',
    svg: wrap(`
      ${paperTile}
      <text x="512" y="380"
        font-family="'JetBrains Mono', monospace"
        font-weight="500" font-size="80" letter-spacing="22"
        text-anchor="middle" fill="${MOSS}" fill-opacity="0.7">QUILL</text>
      <line x1="160" y1="430" x2="864" y2="430"
            stroke="${MOSS}" stroke-opacity="0.4" stroke-width="3"/>
      <text x="512" y="800"
        font-family="'Newsreader', Georgia, serif"
        font-style="italic" font-weight="500" font-size="540" letter-spacing="-8"
        text-anchor="middle" fill="${MOSS}">№ 1</text>
    `),
  },
  {
    id: '10-stacked-rules',
    title: 'Redacted headline',
    description:
      'Pure typographic abstraction — six rules of varying weight and length. A printed page reduced to its skeleton.',
    svg: wrap(`
      ${paperTile}
      <!-- Eyebrow -->
      <line x1="180" y1="240" x2="380" y2="240" stroke="${MOSS}" stroke-width="6" stroke-opacity="0.6"/>
      <!-- Big headline (heaviest) -->
      <line x1="180" y1="370" x2="844" y2="370" stroke="${MOSS}" stroke-width="44"/>
      <line x1="180" y1="450" x2="700" y2="450" stroke="${MOSS}" stroke-width="44"/>
      <line x1="180" y1="530" x2="540" y2="530" stroke="${MOSS}" stroke-width="44"/>
      <!-- Body lines -->
      <line x1="180" y1="660" x2="844" y2="660" stroke="${MOSS}" stroke-width="10" stroke-opacity="0.5"/>
      <line x1="180" y1="710" x2="780" y2="710" stroke="${MOSS}" stroke-width="10" stroke-opacity="0.5"/>
      <line x1="180" y1="760" x2="600" y2="760" stroke="${MOSS}" stroke-width="10" stroke-opacity="0.5"/>
      <!-- Dateline -->
      <line x1="180" y1="850" x2="320" y2="850" stroke="${MOSS}" stroke-width="6" stroke-opacity="0.6"/>
    `),
  },
  {
    id: '11-asterisk',
    title: 'Asterisk *',
    description:
      'Editorial annotation glyph. Six-pointed serif asterisk in moss on cream — pure typography.',
    svg: wrap(`
      ${paperTile}
      <text x="512" y="820"
        font-family="'DM Serif Display', 'Playfair Display', serif"
        font-weight="400" font-size="980" letter-spacing="0"
        text-anchor="middle" fill="${MOSS}">*</text>
    `),
  },
  {
    id: '12-fold-corner',
    title: 'Folded page',
    description:
      'A page being turned. Cream paper with a folded corner exposing the moss verso. Hairline of typography on the visible page.',
    svg: wrap(`
      ${mossTile}
      <!-- Main page: cream rectangle filling almost the canvas -->
      <path d="M 100 100
               L 700 100
               L 924 324
               L 924 924
               L 100 924
               Z"
            fill="url(#paper-bg)"/>
      <rect x="100" y="100" width="824" height="824" filter="url(#grain-paper)" opacity="0.35" clip-path="url(#squircle)"/>
      <!-- Folded corner triangle showing moss verso -->
      <path d="M 700 100
               L 924 324
               L 700 324
               Z"
            fill="${MOSS_DEEP}"/>
      <!-- Subtle fold shadow -->
      <path d="M 700 100 L 700 324 L 924 324"
            fill="none" stroke="${MOSS}" stroke-opacity="0.4" stroke-width="2"/>
      <!-- Hairline of typography on the visible page -->
      <text x="180" y="280"
        font-family="'JetBrains Mono', monospace"
        font-weight="500" font-size="42" letter-spacing="9"
        fill="${MOSS}" fill-opacity="0.7">QUILL — VOL. I</text>
      <line x1="180" y1="320" x2="640" y2="320" stroke="${MOSS}" stroke-opacity="0.3" stroke-width="3"/>
      <!-- A serif word, the "headline" of the page -->
      <text x="180" y="640"
        font-family="'Newsreader', Georgia, serif"
        font-style="italic" font-weight="600" font-size="240" letter-spacing="-8"
        fill="${MOSS}">Issue</text>
      <text x="180" y="800"
        font-family="'Newsreader', Georgia, serif"
        font-weight="500" font-size="240" letter-spacing="-8"
        fill="${MOSS}">One.</text>
    `),
  },
];

async function main() {
  if (existsSync(outDir)) await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    // Render each design at 1024×1024 PNG.
    for (const design of DESIGNS) {
      const html = `<!doctype html><html><head><meta charset="utf-8"/>
        ${fontImports}
        <style>
          html,body{margin:0;padding:0;background:transparent;}
          svg{display:block;}
        </style>
      </head><body>${design.svg.replace(
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
      // Tiny extra settle for noise filter.
      await new Promise((r) => setTimeout(r, 80));
      const buf = await page.locator('svg').screenshot({
        omitBackground: true,
        type: 'png',
      });
      await page.close();
      const outPath = join(outDir, `${design.id}.png`);
      await writeFile(outPath, buf);
      process.stdout.write(`  ${design.id}.png — ${design.title}\n`);
    }

    // Render a single contact sheet showing all 12 in a 3×4 grid with labels.
    const sheetHtml = `<!doctype html><html><head><meta charset="utf-8"/>
      ${fontImports}
      <style>
        html, body { margin: 0; padding: 0; background: ${PAPER}; }
        body {
          font-family: 'Newsreader', Georgia, serif;
          color: ${INK};
          padding: 56px 56px 80px;
        }
        .head { margin-bottom: 32px; }
        .eyebrow {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: ${MOSS};
          opacity: 0.7;
          margin-bottom: 6px;
        }
        h1 { font-size: 36px; font-weight: 600; margin: 0 0 6px; letter-spacing: -0.022em; }
        .lede { font-style: italic; color: #5e564a; max-width: 60ch; line-height: 1.5; }
        .grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 36px 32px;
          margin-top: 32px;
        }
        .card { display: flex; flex-direction: column; gap: 12px; }
        .tile {
          width: 100%; aspect-ratio: 1 / 1; background: transparent;
          border-radius: 24px; overflow: hidden; position: relative;
          border: 1px solid #d4d2c9;
        }
        .tile svg { width: 100%; height: 100%; display: block; }
        .meta { display: flex; flex-direction: column; gap: 2px; padding: 0 4px; }
        .id {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px; letter-spacing: 0.14em;
          text-transform: uppercase; color: ${MOSS}; opacity: 0.7;
        }
        .title { font-size: 18px; font-weight: 600; letter-spacing: -0.014em; }
        .desc {
          font-size: 13px; color: #5e564a;
          line-height: 1.45; font-style: italic; max-width: 36ch;
        }
        hr.rule {
          border: 0; border-top: 1px solid #d4d2c9; margin: 22px 0 0;
        }
      </style>
    </head><body>
      <header class="head">
        <div class="eyebrow">QUILL — ICON DIRECTIONS</div>
        <h1>Twelve covers, one mark.</h1>
        <p class="lede">A portfolio of icon directions to react to. Tile 1–4 push the Q in different typographic registers; 5–6 trade the letter for an editorial object; 7–11 swap the mark to a typographic glyph (¶, &amp;, №, *, etc.); 12 leans into a folded-page composition.</p>
        <hr class="rule"/>
      </header>
      <section class="grid">
        ${DESIGNS.map(
          (d) => `
          <article class="card">
            <div class="tile">${d.svg}</div>
            <div class="meta">
              <span class="id">${d.id}</span>
              <span class="title">${d.title}</span>
              <span class="desc">${d.description.replace(/&/g, '&amp;')}</span>
            </div>
          </article>`,
        ).join('')}
      </section>
    </body></html>`;

    const sheetWidth = 1800;
    const sheetPage = await browser.newPage({
      viewport: { width: sheetWidth, height: 1200 },
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
    await writeFile(join(outDir, '00-contact-sheet.png'), sheetBuf);
    process.stdout.write('  00-contact-sheet.png — overview grid\n');
  } finally {
    await browser.close();
  }

  console.log(`\n✓ ${DESIGNS.length} designs + contact sheet`);
  console.log(`✓ ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
