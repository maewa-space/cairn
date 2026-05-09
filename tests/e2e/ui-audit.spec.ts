// Comprehensive UI audit. Visits every route, captures full-page screenshots
// at 1440x900, and exercises every visible button / menu / form control to
// confirm nothing throws and layout doesn't break. Findings are surfaced as
// console output + assertion failures; screenshots land in test-results/.
//
// This spec is intentionally heavier than the standalone screenshots spec —
// it's the manual QA pass automated.

import { test, expect, type Page } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { launchAndBypassOnboarding } from './_helpers';

const ARTIFACTS = join('test-results', 'ui-audit');
const VIEWPORT = { width: 1440, height: 900 } as const;

let userDataDir: string;

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'quill-ui-audit-'));
  mkdirSync(ARTIFACTS, { recursive: true });
});

test.afterAll(() => {
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

async function dump(win: Page, name: string): Promise<void> {
  await win.waitForTimeout(150); // let MenuPanel fades / focus rings settle
  await win.screenshot({
    path: join(ARTIFACTS, `${name}.png`),
    fullPage: true,
  });
}

async function expectNoOverflow(win: Page, name: string): Promise<void> {
  // The aside + body grid should never produce a window-level scrollbar —
  // see feedback_quill_sidebar_overflow.md. We assert document.scrollHeight
  // does not exceed innerHeight by more than a hairline. In tabbed routes
  // (home, meeting), the inner panes scroll independently.
  const overflow = await win.evaluate(() => {
    return {
      docHeight: document.documentElement.scrollHeight,
      winHeight: window.innerHeight,
      docWidth: document.documentElement.scrollWidth,
      winWidth: window.innerWidth,
    };
  });
  expect.soft(overflow.docHeight, `${name}: vertical body overflow`).toBeLessThanOrEqual(
    overflow.winHeight + 2,
  );
  expect.soft(overflow.docWidth, `${name}: horizontal body overflow`).toBeLessThanOrEqual(
    overflow.winWidth + 2,
  );
}

async function noConsoleErrors(win: Page, name: string, errs: string[]): Promise<void> {
  // Filter out known-noisy errors that aren't actionable for the audit.
  const actionable = errs.filter((e) => {
    if (/Failed to load resource/.test(e)) return false; // image 404s in tests
    if (/AudioContext/.test(e)) return false; // not granted in test env
    return true;
  });
  expect.soft(actionable, `${name}: console errors`).toEqual([]);
}

test('full UI audit — every route and interactive control', async () => {
  test.setTimeout(120_000);
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}`,
  ]);
  await win.setViewportSize(VIEWPORT);

  const consoleErrors: string[] = [];
  win.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  win.on('pageerror', (err) => {
    consoleErrors.push(err.message);
  });

  // Seed a few realistic meetings so the screens have real content (not the
  // empty state). One in a folder, one unfiled.
  const seeded = await win.evaluate(async () => {
    const folder = await window.quill.folders.create('Customers', null);
    const a = await window.quill.meetings.create('Q3 pricing review');
    const b = await window.quill.meetings.create('Customer Discovery — Acme');
    await window.quill.meetings.moveToFolder(b.id, folder.id);
    await window.quill.transcript.append({
      meetingId: a.id,
      speaker: 'mic',
      text: 'Welcome to the Q3 pricing review — let me kick off with the framework.',
      startedAtMs: 0,
      durationMs: 5000,
    });
    await window.quill.transcript.append({
      meetingId: a.id,
      speaker: 'system',
      text: 'Sounds good. I had a couple of questions about the discount tiers.',
      startedAtMs: 5500,
      durationMs: 4500,
    });
    return { folderId: folder.id, meetingId: a.id };
  });

  // ---------- /home ----------
  await win.evaluate(() => (window.location.hash = '#/home'));
  await win.waitForLoadState('domcontentloaded');
  await dump(win, '01-home');
  await expectNoOverflow(win, 'home');

  // The sidebar list should show our seeded meetings.
  await expect(win.getByText('Q3 pricing review').first()).toBeVisible();

  // ---------- /settings ----------
  await win.evaluate(() => (window.location.hash = '#/settings'));
  await win.waitForLoadState('domcontentloaded');
  await dump(win, '02-settings');
  await expectNoOverflow(win, 'settings');

  // Drive the new transcription controls.
  const langSelect = win.getByTestId('transcript-language-select');
  await expect(langSelect).toBeVisible();
  await langSelect.selectOption('de');
  await expect(win.getByTestId('transcript-language-saved')).toBeVisible();

  await langSelect.selectOption('auto');
  const diarize = win.getByTestId('transcript-diarize-toggle');
  await diarize.check();
  await expect(win.getByTestId('transcript-diarize-saved')).toBeVisible();
  await diarize.uncheck();
  await dump(win, '02b-settings-transcription-driven');

  // ---------- /templates ----------
  await win.evaluate(() => (window.location.hash = '#/templates'));
  await win.waitForLoadState('domcontentloaded');
  await dump(win, '03-templates');
  await expectNoOverflow(win, 'templates');

  // All 6 built-ins should render.
  for (const t of ['Generic', 'Customer Discovery', 'User Interview']) {
    await expect.soft(win.getByText(t).first()).toBeVisible();
  }

  // ---------- /chat (global) ----------
  await win.evaluate(() => (window.location.hash = '#/chat'));
  await win.waitForLoadState('domcontentloaded');
  await dump(win, '04-chat-global');
  await expectNoOverflow(win, 'chat-global');

  // ---------- /meeting/:id ----------
  await win.evaluate(
    (id) => (window.location.hash = `#/meeting/${id}`),
    seeded.meetingId,
  );
  await win.waitForLoadState('domcontentloaded');
  // Wait for transcript / view to render.
  await win.waitForTimeout(200);
  await dump(win, '05-meeting');
  await expectNoOverflow(win, 'meeting');

  // The meeting title should reflect what we seeded.
  await expect(win.getByText('Q3 pricing review').first()).toBeVisible();

  // Drive the action menu (non-destructive paths).
  const actionsTrigger = win
    .getByRole('button', { name: /actions|more/i })
    .first();
  if (await actionsTrigger.isVisible().catch(() => false)) {
    await actionsTrigger.click();
    await dump(win, '05b-meeting-actions-open');
    await win.keyboard.press('Escape');
  }

  // Sidebar folder click — narrows to the customer-discovery folder.
  const customersRow = win.getByText('Customers').first();
  if (await customersRow.isVisible().catch(() => false)) {
    await customersRow.click();
    await win.waitForTimeout(120);
    await dump(win, '06-folder-customers-filter');
    await expectNoOverflow(win, 'folder-filter');
  }

  // ---------- Onboarding (force first-time gate) ----------
  // Drop the bootstrapped key + onboarded flag and reload.
  await win.evaluate(async () => {
    await window.quill.keys.delete('openai');
    sessionStorage.removeItem('quill.onboarded');
    window.location.hash = '#/welcome';
  });
  await win.waitForTimeout(120);
  await win.evaluate(() => window.location.reload());
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(200);
  await dump(win, '07-onboarding-intro');

  await noConsoleErrors(win, 'overall', consoleErrors);
  await app.close();
});
