import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

let userDataDir: string;

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'quill-e2e-'));
});

test.afterAll(() => {
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

test('home renders with quill branding and start CTA', async () => {
  const electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });
  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  await expect(window.getByText('Quill').first()).toBeVisible();
  await expect(
    window.getByTestId('start-new-meeting'),
  ).toBeVisible();

  await electronApp.close();
});

test('starts a new meeting and opens meeting view', async () => {
  const electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
  });
  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  await window.getByTestId('start-new-meeting').click();
  await expect(window.getByTestId('meeting-title')).toBeVisible();
  await expect(window.getByTestId('record-start')).toBeVisible();
  await expect(window.getByTestId('transcript-stream')).toBeVisible();

  await electronApp.close();
});

test('templates route lists 6 built-in templates', async () => {
  const electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
  });
  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

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

  await electronApp.close();
});
