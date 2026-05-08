import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { launchAndBypassOnboarding } from './_helpers';

let userDataDir: string;

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'quill-tpl-'));
});

test.afterAll(() => {
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

test('custom template: create → appears in list → editable → deletable', async () => {
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}`,
  ]);

  // Stub confirm so delete proceeds
  await win.evaluate(() => {
    window.confirm = () => true;
  });

  await win.getByRole('link', { name: /Templates/i }).click();

  // Create
  await win.getByTestId('template-new').click();
  await expect(win.getByTestId('template-name')).toBeVisible();
  await win.getByTestId('template-name').fill('Sales follow-up');
  await win.getByTestId('template-description').fill('Recap a sales call.');
  await win
    .getByTestId('template-system')
    .fill(
      'You are a sales scribe. Summarize the call, note objections, and capture next steps.',
    );
  await win
    .getByTestId('template-body')
    .fill(
      '## Account context\n\n## Objections raised\n\n## Next steps\n- [ ] item',
    );
  await win.getByTestId('template-save').click();

  // Lands on view mode for the new template — heading shows
  await expect(
    win.locator('h1').filter({ hasText: 'Sales follow-up' }),
  ).toBeVisible();
  // Custom badge appears in sidebar
  await expect(win.getByText('custom').first()).toBeVisible();

  // Edit it
  await win.getByRole('button', { name: /^Edit$/ }).click();
  const desc = win.getByTestId('template-description');
  await desc.fill('Recap a sales call — updated.');
  await win.getByTestId('template-save').click();
  // Description appears in two places (sidebar item + main paragraph) — first is fine.
  await expect(
    win.getByText('Recap a sales call — updated.').first(),
  ).toBeVisible();

  // Delete it
  await win.getByRole('button', { name: /^Delete$/ }).click();

  // Should fall back to first template (alphabetically — "1-on-1")
  await expect(
    win.locator('h1').filter({ hasText: 'Sales follow-up' }),
  ).toHaveCount(0);

  // Custom no longer in DB
  const customs = await win.evaluate(async () => {
    const list = await window.quill.templates.list();
    return list.filter((t) => !t.builtIn);
  });
  expect(customs.length).toBe(0);

  await app.close();
});

test('built-in templates show no Edit/Delete affordance', async () => {
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}-builtin`,
  ]);

  await win.getByRole('link', { name: /Templates/i }).click();
  await win.getByTestId('template-pick-customer-discovery').click();

  await expect(
    win.locator('h1').filter({ hasText: 'Customer Discovery 101' }),
  ).toBeVisible();
  // No Edit / Delete buttons next to the built-in heading
  await expect(win.getByRole('button', { name: /^Edit$/ })).toHaveCount(0);
  await expect(win.getByRole('button', { name: /^Delete$/ })).toHaveCount(0);

  await app.close();
});
