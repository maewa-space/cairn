import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

let userDataDir: string;

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'quill-onb-'));
});

test.afterAll(() => {
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

test('onboarding finish path stores OpenAI key and lands on home', async () => {
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}-finish`],
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  // Step 1 — intro
  await expect(win.getByTestId('onboarding-intro')).toBeVisible();
  await expect(
    win.getByText(/A quiet notetaker for your meetings/i),
  ).toBeVisible();
  await win.getByTestId('onboarding-next-permissions').click();

  // Step 2 — permissions
  await expect(win.getByTestId('onboarding-permissions')).toBeVisible();
  await expect(win.getByText('Microphone', { exact: true })).toBeVisible();
  await expect(win.getByText('Screen Recording', { exact: true })).toBeVisible();
  await win.getByTestId('onboarding-next-keys').click();

  // Step 3 — keys
  await expect(win.getByTestId('onboarding-keys')).toBeVisible();
  // Finish button is disabled until OpenAI key is filled
  const finish = win.getByTestId('onboarding-finish');
  await expect(finish).toBeDisabled();
  await win.getByTestId('onboarding-key-openai').fill('sk-test-finish-flow');
  await win.getByTestId('onboarding-key-anthropic').fill('sk-ant-finish');
  await expect(finish).toBeEnabled();
  await finish.click();

  // Lands on /home, no longer on onboarding
  await expect(win.getByTestId('start-new-meeting')).toBeVisible();

  // Both keys persisted
  const [hasOpenai, hasAnthropic] = await win.evaluate(async () => [
    await window.quill.keys.has('openai'),
    await window.quill.keys.has('anthropic'),
  ]);
  expect(hasOpenai).toBe(true);
  expect(hasAnthropic).toBe(true);

  await app.close();
});

test('onboarding back-navigation preserves earlier inputs', async () => {
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}-back`],
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  await win.getByTestId('onboarding-next-permissions').click();
  await win.getByTestId('onboarding-next-keys').click();
  await win.getByTestId('onboarding-key-openai').fill('sk-typed-once');

  // Back to permissions, then forward — input should still be there
  await win.getByRole('button', { name: 'Back' }).click();
  await expect(win.getByTestId('onboarding-permissions')).toBeVisible();
  await win.getByTestId('onboarding-next-keys').click();
  await expect(win.getByTestId('onboarding-key-openai')).toHaveValue(
    'sk-typed-once',
  );

  await app.close();
});
