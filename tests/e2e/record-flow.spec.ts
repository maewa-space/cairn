import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

let userDataDir: string;

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'cairn-flow-'));
});

test.afterAll(() => {
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

test('transcript entries appended via IPC render with correct speaker styling', async () => {
  const electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
  });
  const win = await electronApp.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  // Create a meeting via the API and navigate to it
  const meetingId = await win.evaluate(async () => {
    const m = await window.cairn.meetings.create('E2E test meeting');
    return m.id;
  });
  await win.evaluate((id) => {
    window.location.hash = `#/meeting/${id}`;
  }, meetingId);

  await expect(win.getByTestId('meeting-title')).toHaveValue('E2E test meeting');

  // Append two transcript entries (other + me) via the preload IPC
  await win.evaluate(async (id) => {
    await window.cairn.transcript.append({
      meetingId: id,
      speaker: 'system',
      text: 'Yesterday I shipped the migration.',
      startedAtMs: 0,
      durationMs: 4200,
    });
    await window.cairn.transcript.append({
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
  const electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
  });
  const win = await electronApp.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  await win.getByRole('link', { name: /Settings/i }).click();
  await win.getByTestId('key-input-openai').fill('sk-test-openai-12345');
  await win.getByRole('button', { name: /^Save$/ }).first().click();
  await expect(win.getByText('stored').first()).toBeVisible();

  // Confirm via IPC
  const has = await win.evaluate(() => window.cairn.keys.has('openai'));
  expect(has).toBe(true);

  await electronApp.close();
});
