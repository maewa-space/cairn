import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { launchAndBypassOnboarding } from './_helpers';

let userDataDir: string;

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'quill-transcription-'));
});

test.afterAll(() => {
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

test('transcription Settings persists language and diarize choices', async () => {
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}`,
  ]);

  // Seed empty — settings start at defaults (Auto, diarize off).
  await win.evaluate(() => (window.location.hash = '#/settings'));

  const languageSelect = win.getByTestId('transcript-language-select');
  await expect(languageSelect).toBeVisible();
  await expect(languageSelect).toHaveValue('auto');

  const diarizeToggle = win.getByTestId('transcript-diarize-toggle');
  await expect(diarizeToggle).not.toBeChecked();

  // Pick German + enable diarization.
  await languageSelect.selectOption('de');
  await diarizeToggle.check();

  // Both choices should round-trip via the new settings IPC bridge.
  const stored = await win.evaluate(async () => {
    return {
      lang: await window.quill.settings.get('transcript.language'),
      diar: await window.quill.settings.get('transcript.diarize'),
    };
  });
  expect(stored.lang).toBe('de');
  expect(stored.diar).toBe('1');

  // Reload the route — choices should still be reflected in the UI.
  await win.evaluate(() => (window.location.hash = '#/'));
  await win.evaluate(() => (window.location.hash = '#/settings'));
  await expect(win.getByTestId('transcript-language-select')).toHaveValue('de');
  await expect(win.getByTestId('transcript-diarize-toggle')).toBeChecked();

  // Non-whitelisted keys are rejected by the main-process bridge.
  const rejected = await win.evaluate(async () => {
    try {
      await window.quill.settings.set('arbitrary.evil', 'pwn');
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  });
  expect(rejected).toMatch(/not renderer-writable/);

  await app.close();
});
