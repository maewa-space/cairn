// Smoke-tests the actually-packaged .app inside the mounted DMG.
// Skipped when the DMG hasn't been mounted at /Volumes/Quill 0.1.0-arm64.
import { test, expect, _electron as electron } from '@playwright/test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const APP_PATH = '/Volumes/Quill 0.1.0-arm64/Quill.app';
const EXECUTABLE = `${APP_PATH}/Contents/MacOS/Quill`;

test.skip(
  !existsSync(EXECUTABLE),
  'Quill.app DMG not mounted at /Volumes/Quill 0.1.0-arm64',
);

let userDataDir: string;

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'quill-dmg-'));
});

test.afterAll(() => {
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

test('packaged DMG launches and shows onboarding', async () => {
  test.setTimeout(45_000);
  const app = await electron.launch({
    executablePath: EXECUTABLE,
    args: [`--user-data-dir=${userDataDir}`],
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  // Onboarding intro must render — confirms renderer + preload + IPC all wired.
  await expect(win.getByTestId('onboarding-intro')).toBeVisible();
  await expect(win.getByText(/Note every meeting/i)).toBeVisible();

  await app.close();
});

test('packaged DMG seeds all 6 built-in templates from extraResources', async () => {
  test.setTimeout(45_000);
  const app = await electron.launch({
    executablePath: EXECUTABLE,
    args: [`--user-data-dir=${userDataDir}-tpl`],
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  // Skip onboarding by setting flag + key
  await win.evaluate(async () => {
    await window.quill.keys.set('openai', 'sk-test-bootstrap');
    sessionStorage.setItem('quill.onboarded', '1');
  });

  // Verify templates loaded
  const ids = await win.evaluate(async () => {
    const list = await window.quill.templates.list();
    return list.map((t) => t.id).sort();
  });

  expect(ids).toEqual(
    [
      'customer-discovery',
      'generic',
      'one-on-one',
      'pitch',
      'standup',
      'user-interview',
    ].sort(),
  );

  await app.close();
});

test('packaged DMG seeds all 6 built-in recipes from extraResources', async () => {
  test.setTimeout(45_000);
  const app = await electron.launch({
    executablePath: EXECUTABLE,
    args: [`--user-data-dir=${userDataDir}-rcp`],
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  await win.evaluate(async () => {
    await window.quill.keys.set('openai', 'sk-test-bootstrap');
    sessionStorage.setItem('quill.onboarded', '1');
  });

  const triggers = await win.evaluate(async () => {
    const list = await window.quill.recipes.list();
    return list.map((r) => r.trigger).sort();
  });

  expect(triggers).toEqual(
    ['action-items', 'coach', 'decisions', 'follow-up', 'objections', 'prep'].sort(),
  );

  await app.close();
});
