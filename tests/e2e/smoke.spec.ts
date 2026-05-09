import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { launchAndBypassOnboarding } from './_helpers';

let userDataDir: string;

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'quill-e2e-'));
});

test.afterAll(() => {
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

test('home renders with quill branding and start CTA', async () => {
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}`,
  ]);

  await expect(win.getByText('Quill').first()).toBeVisible();
  await expect(win.getByTestId('start-new-meeting')).toBeVisible();

  await app.close();
});

test('starts a new meeting and opens meeting view', async () => {
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}`,
  ]);

  await win.getByTestId('start-new-meeting').click();
  await expect(win.getByTestId('meeting-title')).toBeVisible();
  await expect(win.getByTestId('record-start')).toBeVisible();
  // Right pane defaults to Chat tab — composer should be visible.
  await expect(win.getByTestId('chat-composer')).toBeVisible();
  // Switching to Transcript tab reveals the live transcript pane.
  await win.getByRole('button', { name: /^Transcript/ }).click();
  await expect(win.getByTestId('transcript-stream')).toBeVisible();

  await app.close();
});

test('templates route lists 6 built-in templates', async () => {
  const { app, win: window } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}`,
  ]);

  await window.getByRole('link', { name: /Templates/i }).click();
  await expect(window.getByRole('button', { name: /Customer Discovery 101/ })).toBeVisible();
  await expect(window.getByRole('button', { name: /User Interview/ })).toBeVisible();
  await expect(window.getByRole('button', { name: /Pitch Meeting/ })).toBeVisible();
  await expect(window.getByRole('button', { name: /Stand-up/ })).toBeVisible();
  await expect(window.getByRole('button', { name: /1-on-1/ })).toBeVisible();
  await expect(window.getByRole('button', { name: /Generic Meeting/ })).toBeVisible();
  // Click Customer Discovery, expect it as the active heading
  await window.getByRole('button', { name: /Customer Discovery 101/ }).click();
  await expect(
    window.locator('h1').filter({ hasText: /Customer Discovery 101/ }),
  ).toBeVisible();

  await app.close();
});
