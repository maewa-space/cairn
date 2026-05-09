// Renders a Quill meeting into a self-contained editorial-style HTML document
// for `printToPDF`. Mirrors the in-app vocabulary: warm paper background,
// Newsreader serif for titles + drop cap, Inter for body, JetBrains Mono for
// the masthead/footer datelines.
//
// Fonts are embedded as base64-encoded woff2 data URIs so the document is
// fully self-contained; no asset path resolution at print time. The fonts are
// read once and cached at module scope.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Meeting, TranscriptEntry } from '@shared/types.js';
import { renderMarkdown } from '@shared/markdown.js';

const require = createRequire(import.meta.url);

interface FontBundle {
  newsreaderRegular: string;
  newsreaderItalic: string;
  inter: string;
  mono: string;
}

let fontCache: FontBundle | null = null;

function loadFontBase64(packageName: string, file: string): string {
  const resolved = require.resolve(`${packageName}/files/${file}`);
  return readFileSync(resolved).toString('base64');
}

function getFonts(): FontBundle {
  if (fontCache) return fontCache;
  // Latin-only weight axis (variable woff2). Total ~210 KB raw, ~280 KB base64.
  fontCache = {
    newsreaderRegular: loadFontBase64(
      '@fontsource-variable/newsreader',
      'newsreader-latin-wght-normal.woff2',
    ),
    newsreaderItalic: loadFontBase64(
      '@fontsource-variable/newsreader',
      'newsreader-latin-wght-italic.woff2',
    ),
    inter: loadFontBase64(
      '@fontsource-variable/inter',
      'inter-latin-wght-normal.woff2',
    ),
    mono: loadFontBase64(
      '@fontsource-variable/jetbrains-mono',
      'jetbrains-mono-latin-wght-normal.woff2',
    ),
  };
  return fontCache;
}

export interface RenderPdfHtmlInput {
  meeting: Pick<
    Meeting,
    'title' | 'startedAt' | 'rawNotes' | 'enhancedNotes' | 'transcript'
  >;
  /** Pre-rendered "QUILL — VOL. I · ISSUE 23" line. */
  issueLabel: string;
  /** Pre-rendered "WED, MAY 8, 2026" line. */
  dateLabel: string;
  /** Override "Started 14:02 · 38 min · 4 voices" dek. */
  dekLine?: string;
}

export interface RenderPdfFooterInput {
  /** Italic Newsreader footer-left text. */
  brand?: string;
}

const TRANSCRIPT_INCLUDE_LIMIT = 50;

export function renderPdfHtml(input: RenderPdfHtmlInput): string {
  const { meeting, issueLabel, dateLabel } = input;
  const fonts = getFonts();

  const dek = input.dekLine ?? buildDekLine(meeting);
  const bodyHtml = renderBody(meeting);
  const transcriptHtml = renderTranscript(meeting.transcript);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(meeting.title)}</title>
<style>
@font-face {
  font-family: 'Newsreader';
  src: url(data:font/woff2;base64,${fonts.newsreaderRegular}) format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: 'Newsreader';
  src: url(data:font/woff2;base64,${fonts.newsreaderItalic}) format('woff2');
  font-weight: 100 900;
  font-style: italic;
  font-display: block;
}
@font-face {
  font-family: 'Inter';
  src: url(data:font/woff2;base64,${fonts.inter}) format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: 'JetBrains Mono';
  src: url(data:font/woff2;base64,${fonts.mono}) format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: block;
}

:root {
  /* Mirror src/renderer/src/styles/tokens.css. Keep these in sync — the
   * PDF template is print-only and doesn't import the renderer CSS, so
   * any token drift here surfaces as an in-app vs. exported-PDF mismatch.
   * --moss is the forest brand green; surfaces match the renderer cream. */
  --surface: oklch(99% 0.012 90);
  --ink: oklch(22% 0.018 250);
  --ink-muted: oklch(44% 0.012 250);
  --ink-soft: oklch(62% 0.010 250);
  --moss: oklch(31% 0.06 158);
  --edge: oklch(88% 0.010 250);
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--surface);
  color: var(--ink);
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 10.5pt;
  line-height: 1.55;
  letter-spacing: -0.005em;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.masthead {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 10pt;
  border-bottom: 0.5pt solid var(--edge);
  margin-bottom: 22pt;
}
.masthead-side {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 8.5pt;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}

.title-block {
  margin-bottom: 16pt;
}
.title {
  font-family: 'Newsreader', Georgia, serif;
  font-size: 30pt;
  font-weight: 500;
  letter-spacing: -0.022em;
  line-height: 1.1;
  margin: 0 0 6pt;
  color: var(--ink);
}
.dek {
  font-family: 'Newsreader', Georgia, serif;
  font-style: italic;
  font-size: 11.5pt;
  color: var(--ink-muted);
  margin: 0;
  letter-spacing: -0.005em;
}

.rule {
  border: 0;
  border-top: 0.5pt solid var(--edge);
  margin: 14pt 0 18pt;
}

.body { margin-top: 4pt; }
.body :is(h1, h2, h3) {
  break-after: avoid;
  page-break-after: avoid;
  orphans: 3;
  widows: 3;
  font-family: 'Newsreader', Georgia, serif;
  font-weight: 500;
  letter-spacing: -0.018em;
  color: var(--ink);
}
.body h1 { font-size: 18pt; margin: 16pt 0 6pt; }
.body h2 { font-size: 14pt; margin: 13pt 0 5pt; }
.body h3 { font-size: 11.5pt; font-weight: 600; letter-spacing: -0.01em; margin: 11pt 0 4pt; }
.body p { margin: 6pt 0; line-height: 1.58; orphans: 3; widows: 3; }
.body ul, .body ol { margin: 6pt 0 6pt 20pt; padding: 0; }
.body li { margin: 2pt 0; line-height: 1.55; orphans: 3; widows: 3; }
.body blockquote {
  border-left: 1.5pt solid var(--moss);
  padding-left: 10pt;
  color: var(--ink-muted);
  margin: 8pt 0;
  font-style: italic;
}
.body code {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 0.88em;
  padding: 0 0.3em;
  border-radius: 2pt;
  background: oklch(96% 0.014 90);
}
.body strong { font-weight: 600; }
.body em { font-style: italic; }

/* Drop cap — only on enhanced first paragraph. Mirrors the app rule. */
.body--enhanced > p:first-of-type::first-letter,
.body--enhanced > article > p:first-of-type::first-letter {
  font-family: 'Newsreader', Georgia, serif;
  font-weight: 500;
  font-size: 3.4em;
  float: left;
  line-height: 0.85;
  margin: 0.05em 0.16em -0.05em 0;
  color: var(--moss);
  font-feature-settings: 'lnum';
}

.empty-note {
  font-family: 'Newsreader', Georgia, serif;
  font-style: italic;
  color: var(--ink-soft);
  font-size: 11pt;
}

.transcript {
  margin-top: 28pt;
  page-break-before: auto;
}
.transcript-eyebrow {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 9pt;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-soft);
  margin-bottom: 4pt;
}
.transcript-rule {
  border: 0;
  border-top: 0.5pt solid var(--edge);
  margin: 0 0 12pt;
}
.transcript-omitted {
  font-family: 'Newsreader', Georgia, serif;
  font-style: italic;
  color: var(--ink-soft);
  font-size: 10pt;
}
.transcript-entry {
  margin-bottom: 10pt;
  page-break-inside: avoid;
  break-inside: avoid;
}
.transcript-meta {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 7.75pt;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
  margin-bottom: 1pt;
}
.transcript-text {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 10pt;
  line-height: 1.55;
  color: var(--ink);
}
</style>
</head>
<body>
  <header class="masthead">
    <div class="masthead-side">${escapeHtml(issueLabel)}</div>
    <div class="masthead-side">${escapeHtml(dateLabel)}</div>
  </header>
  <section class="title-block">
    <h1 class="title">${escapeHtml(meeting.title)}</h1>
    ${dek ? `<p class="dek">${escapeHtml(dek)}</p>` : ''}
  </section>
  <hr class="rule" />
  ${bodyHtml}
  ${transcriptHtml}
</body>
</html>`;
}

/** Builds the footer template that Chromium injects on every page via
 *  `displayHeaderFooter: true, footerTemplate`.
 *
 *  Chromium's header/footer templates run in their own document and need
 *  inline styles. Special tokens: <span class="pageNumber">, <span class="totalPages">.
 */
export function renderPdfFooterTemplate(input: RenderPdfFooterInput = {}): string {
  const brand = input.brand ?? 'Quill — open notebook';
  return `<style>
.q-foot {
  width: 100%;
  font-size: 7.5pt;
  color: #8b8b85;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0 0.75in;
  -webkit-print-color-adjust: exact;
}
.q-foot .left {
  font-family: 'Newsreader', Georgia, serif;
  font-style: italic;
  letter-spacing: 0;
}
.q-foot .right {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
</style>
<div class="q-foot">
  <span class="left">${escapeHtml(brand)}</span>
  <span class="right"><span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>`;
}

/** An empty header — Chromium requires a value when displayHeaderFooter is on. */
export function renderPdfHeaderTemplate(): string {
  return '<span></span>';
}

function buildDekLine(
  meeting: Pick<Meeting, 'startedAt' | 'transcript'>,
): string {
  const parts: string[] = [];
  if (meeting.startedAt) {
    const startedAt = new Date(meeting.startedAt);
    if (!Number.isNaN(startedAt.getTime())) {
      const hh = String(startedAt.getHours()).padStart(2, '0');
      const mm = String(startedAt.getMinutes()).padStart(2, '0');
      parts.push(`Started ${hh}:${mm}`);
    }
  }
  const transcript = meeting.transcript ?? [];
  if (transcript.length > 0) {
    const last = transcript[transcript.length - 1];
    const minutes = Math.round((last.startedAtMs + last.durationMs) / 60000);
    if (minutes > 0) parts.push(`${minutes} min`);
    const speakers = new Set(transcript.map((t) => t.speaker)).size;
    if (speakers > 0) parts.push(`${speakers} ${speakers === 1 ? 'voice' : 'voices'}`);
  }
  return parts.join(' · ');
}

function renderBody(
  meeting: Pick<Meeting, 'rawNotes' | 'enhancedNotes'>,
): string {
  if (meeting.enhancedNotes && meeting.enhancedNotes.trim()) {
    const inner = renderMarkdown(meeting.enhancedNotes);
    return `<article class="body body--enhanced">${inner}</article>`;
  }
  const rawHtml = (meeting.rawNotes ?? '').trim();
  if (rawHtml) {
    return `<article class="body">${rawHtml}</article>`;
  }
  return `<article class="body"><p class="empty-note">No notes captured.</p></article>`;
}

function renderTranscript(transcript: TranscriptEntry[] | undefined): string {
  if (!transcript || transcript.length === 0) return '';
  if (transcript.length > TRANSCRIPT_INCLUDE_LIMIT) {
    return `<section class="transcript">
      <hr class="transcript-rule" />
      <div class="transcript-eyebrow">Transcript</div>
      <p class="transcript-omitted">Transcript omitted — ${transcript.length} entries.</p>
    </section>`;
  }
  const entries = transcript
    .map((entry) => {
      const meta = formatTranscriptMeta(entry);
      return `<div class="transcript-entry">
        <div class="transcript-meta">${escapeHtml(meta)}</div>
        <div class="transcript-text">${escapeHtml(entry.text)}</div>
      </div>`;
    })
    .join('');
  return `<section class="transcript">
    <hr class="transcript-rule" />
    <div class="transcript-eyebrow">Transcript</div>
    ${entries}
  </section>`;
}

function formatTranscriptMeta(entry: TranscriptEntry): string {
  const seconds = Math.floor(entry.startedAtMs / 1000);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const speaker = transcriptSpeakerLabel(entry.speaker);
  return `${speaker} · ${mm}:${ss}`;
}

function transcriptSpeakerLabel(speaker: TranscriptEntry['speaker']): string {
  if (speaker === 'mic') return 'You';
  if (speaker === 'system') return 'System';
  // Diarized speaker labels (`speaker-N`) — render as "Speaker N".
  if (typeof speaker === 'string' && speaker.startsWith('speaker-')) {
    const n = Number.parseInt(speaker.slice('speaker-'.length), 10);
    return Number.isFinite(n) ? `Speaker ${n}` : 'System';
  }
  return 'System';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
