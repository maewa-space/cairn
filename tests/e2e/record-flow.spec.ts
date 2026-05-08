import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { launchAndBypassOnboarding } from './_helpers';

let userDataDir: string;

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'quill-flow-'));
});

test.afterAll(() => {
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

test('transcript entries appended via IPC render with correct speaker styling', async () => {
  const { app: electronApp, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}`,
  ]);

  // Create a meeting via the API and navigate to it
  const meetingId = await win.evaluate(async () => {
    const m = await window.quill.meetings.create('E2E test meeting');
    return m.id;
  });
  await win.evaluate((id) => {
    window.location.hash = `#/meeting/${id}`;
  }, meetingId);

  await expect(win.getByTestId('meeting-title')).toHaveValue('E2E test meeting');

  // Append two transcript entries (other + me) via the preload IPC
  await win.evaluate(async (id) => {
    await window.quill.transcript.append({
      meetingId: id,
      speaker: 'system',
      text: 'Yesterday I shipped the migration.',
      startedAtMs: 0,
      durationMs: 4200,
    });
    await window.quill.transcript.append({
      meetingId: id,
      speaker: 'mic',
      text: 'Any blockers on the auth flow?',
      startedAtMs: 5000,
      durationMs: 3000,
    });
  }, meetingId);

  // Reload the page so the meeting route hydrates the persisted transcript
  await win.reload();
  await win.evaluate((id) => {
    window.location.hash = `#/meeting/${id}`;
  }, meetingId);

  const stream = win.getByTestId('transcript-stream');
  await expect(stream).toContainText('shipped the migration');
  await expect(stream).toContainText('blockers on the auth flow');
  await expect(stream.locator('[data-speaker=system]').first()).toBeVisible();
  await expect(stream.locator('[data-speaker=mic]').first()).toBeVisible();

  await electronApp.close();
});

test('settings stores keys via safeStorage and reports them as set', async () => {
  // Don't pre-seed — exercise the real onboarding-skip path so the OpenAI
  // section starts empty and the Save button is enabled.
  const { _electron: electron } = await import('@playwright/test');
  const electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}-fresh`],
  });
  const win = await electronApp.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  // Click through to "Skip for now" in onboarding to land on /home
  await expect(win.getByTestId('onboarding-intro')).toBeVisible();
  await win.getByTestId('onboarding-next-permissions').click();
  await win.getByTestId('onboarding-next-keys').click();
  await win.getByTestId('onboarding-skip').click();

  await win.getByRole('link', { name: /Settings/i }).click();
  // OpenAI card scope so we click the right Save button
  const openaiCard = win.locator('div.card', { has: win.getByTestId('key-input-openai') });
  await openaiCard.getByTestId('key-input-openai').fill('sk-test-openai-12345');
  await openaiCard.getByRole('button', { name: /^Save$/ }).click();
  await expect(openaiCard.getByText('stored')).toBeVisible();

  const has = await win.evaluate(() => window.quill.keys.has('openai'));
  expect(has).toBe(true);

  await electronApp.close();
});
