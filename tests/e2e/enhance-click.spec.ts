// Regression: clicking "Enhance notes" must never silently no-op.
// Bug: meeting load reset the EnhanceBar's bootstrap templateId to null
// (since persisted meeting.templateId was null), and runEnhance early-
// returned. Visual button still showed a template name because EnhanceBar
// renders templates[0] as a fallback.

import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { launchAndBypassOnboarding } from './_helpers';

let userDataDir: string;

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'quill-enhance-click-'));
});

test.afterAll(() => {
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

test('clicking Enhance notes never silently no-ops, even on a fresh meeting', async () => {
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}`,
  ]);

  // Clear the bootstrap test key so enhance throws synchronously with
  // "No enhancement key configured" — keeps the test deterministic and
  // fast (no real HTTP call to OpenAI with a bogus key). The onboarded
  // session flag prevents FirstRunGate from redirecting once the key
  // is gone.
  await win.evaluate(async () => {
    sessionStorage.setItem('quill.onboarded', '1');
    await window.quill.keys.delete('openai');
  });

  // Seed a meeting with transcript so the Enhance button isn't disabled.
  // Meeting has no templateId persisted — exactly the state that triggered
  // the silent failure before the fix.
  const meetingId = await win.evaluate(async () => {
    const m = await window.quill.meetings.create('Test enhance flow');
    await window.quill.transcript.append({
      meetingId: m.id,
      speaker: 'mic',
      text: 'Some content so the enhance button is enabled.',
      startedAtMs: 0,
      durationMs: 5000,
    });
    return m.id;
  });

  await win.evaluate(
    (id) => (window.location.hash = `#/meeting/${id}`),
    meetingId,
  );
  await win.waitForLoadState('domcontentloaded');

  const enhanceBtn = win.getByTestId('enhance-run');
  await expect(enhanceBtn).toBeEnabled();

  // Track console errors so we can assert the catch path actually fired
  // (silent no-op would mean no '[enhance]' console.error AT ALL).
  const enhanceErrors: string[] = [];
  win.on('console', (m) => {
    if (m.type() === 'error' && m.text().includes('[enhance]')) {
      enhanceErrors.push(m.text());
    }
  });

  await enhanceBtn.click();

  // The user has no LLM key set, so enhance.run() throws synchronously.
  // The fix surfaces it as the inline editorial banner — silent no-op
  // would mean neither the catch console.error nor the banner appears.
  await expect.poll(() => enhanceErrors.length, { timeout: 5000 }).toBeGreaterThan(0);
  expect(enhanceErrors[0]).toMatch(/No enhancement key configured/);

  await app.close();
});
