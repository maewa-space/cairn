// Renders a meeting HTML template into a PDF using Electron's printToPDF.
// Spawns a hidden, isolated BrowserWindow, loads the template via a temp .html
// file (more reliable than oversized data: URIs on some Chromium builds),
// waits for fonts to settle, then captures the PDF buffer.

import { BrowserWindow, app } from 'electron';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  renderPdfHtml,
  renderPdfHeaderTemplate,
  renderPdfFooterTemplate,
  type RenderPdfHtmlInput,
} from './pdf-template.js';

export type PdfPageSize = 'Letter' | 'A4';

const EUROPEAN_LOCALE_PREFIXES = [
  'de', 'fr', 'it', 'es', 'pt', 'nl', 'pl', 'sv', 'da', 'fi',
  'no', 'cs', 'hu', 'el', 'bg', 'ro', 'sk', 'hr', 'et', 'lv',
  'lt', 'mt', 'sl', 'ga', 'is', 'ca', 'eu', 'gl',
];

export function pickDefaultPageSize(locale: string): PdfPageSize {
  const lower = locale.toLowerCase();
  return EUROPEAN_LOCALE_PREFIXES.some((p) => lower.startsWith(p))
    ? 'A4'
    : 'Letter';
}

export interface RenderMeetingPdfOptions extends RenderPdfHtmlInput {
  pageSize?: PdfPageSize;
}

export interface RenderMeetingPdfResult {
  buffer: Buffer;
  pageSize: PdfPageSize;
}

export async function renderMeetingPdfBuffer(
  options: RenderMeetingPdfOptions,
): Promise<RenderMeetingPdfResult> {
  const pageSize =
    options.pageSize ?? pickDefaultPageSize(safeLocale());
  const html = renderPdfHtml(options);

  const dir = await mkdtemp(join(tmpdir(), 'quill-pdf-'));
  const htmlPath = join(dir, 'doc.html');
  await writeFile(htmlPath, html, 'utf-8');

  const win = new BrowserWindow({
    show: false,
    width: 850,
    height: 1100,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: true,
    },
  });

  try {
    await loadHtml(win, htmlPath);
    // Fonts are inlined as base64 — usually instant — but defer one tick so
    // Chromium has fully painted the first layout before we ask for the PDF.
    await win.webContents.executeJavaScript(
      'document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true',
      true,
    );
    await delay(120);

    const margins =
      pageSize === 'A4'
        ? { top: 0.71, bottom: 0.55, left: 0.71, right: 0.71 } // ~18mm
        : { top: 0.75, bottom: 0.55, left: 0.75, right: 0.75 };

    const buffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize,
      margins,
      displayHeaderFooter: true,
      headerTemplate: renderPdfHeaderTemplate(),
      footerTemplate: renderPdfFooterTemplate(),
      preferCSSPageSize: false,
    });
    return { buffer, pageSize };
  } finally {
    if (!win.isDestroyed()) win.destroy();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function renderMeetingPdfToFile(
  outputPath: string,
  options: RenderMeetingPdfOptions,
): Promise<{ pageSize: PdfPageSize }> {
  const { buffer, pageSize } = await renderMeetingPdfBuffer(options);
  try {
    await writeFile(outputPath, buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not write ${outputPath}: ${msg}`);
  }
  return { pageSize };
}

function loadHtml(win: BrowserWindow, htmlPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onFinish = () => {
      win.webContents.off('did-fail-load', onFail);
      resolve();
    };
    const onFail = (
      _event: Electron.Event,
      errorCode: number,
      errorDescription: string,
    ) => {
      win.webContents.off('did-finish-load', onFinish);
      reject(
        new Error(`PDF template load failed (${errorCode}): ${errorDescription}`),
      );
    };
    win.webContents.once('did-finish-load', onFinish);
    win.webContents.once('did-fail-load', onFail);
    win.loadFile(htmlPath).catch(reject);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function safeLocale(): string {
  try {
    return app.getLocale() || 'en-US';
  } catch {
    return 'en-US';
  }
}
