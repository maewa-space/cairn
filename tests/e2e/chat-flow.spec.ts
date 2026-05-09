import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { launchAndBypassOnboarding } from './_helpers';

let userDataDir: string;

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'quill-chat-'));
});

test.afterAll(() => {
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

// We stub fetch in the main process so chat:send returns a deterministic
// assistant message without hitting any real API.
async function stubAnthropic(app: import('@playwright/test').ElectronApplication, body: string) {
  await app.evaluate(({}, replyText: string) => {
    const orig = global.fetch;
    global.fetch = (async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('anthropic.com')) {
        return new Response(
          JSON.stringify({
            content: [{ type: 'text', text: replyText }],
            usage: { input_tokens: 50, output_tokens: 12 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return orig(url as never, init);
    }) as typeof global.fetch;
  }, body);
}

test('chat composer sends a message and renders the assistant reply', async () => {
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}`,
  ]);

  // Pretend the user has an anthropic key so the chat path is enabled.
  await win.evaluate(async () => {
    await window.quill.keys.set('anthropic', 'sk-ant-test');
  });

  await stubAnthropic(app, 'The biggest pain point is search.');

  // Create a meeting + open it
  const meetingId = await win.evaluate(async () => {
    const m = await window.quill.meetings.create('Discovery with Alex');
    await window.quill.meetings.saveNotes(
      m.id,
      'Alex described pain around onboarding and search.',
    );
    return m.id;
  });
  await win.evaluate((id) => {
    window.location.hash = `#/meeting/${id}`;
  }, meetingId);

  await expect(win.getByTestId('chat-composer')).toBeVisible();
  await win.getByTestId('chat-composer').fill('What hurts most?');
  await win.getByTestId('chat-send').click();

  const messages = win.getByTestId('chat-messages');
  await expect(messages.locator('[data-role=user]')).toContainText('What hurts most?');
  await expect(messages.locator('[data-role=assistant]')).toContainText(
    'biggest pain point is search',
  );

  await app.close();
});

test('typing / opens recipe menu and applying it persists across reload', async () => {
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}-recipes`,
  ]);

  await win.evaluate(async () => {
    await window.quill.keys.set('anthropic', 'sk-ant-test');
  });
  await stubAnthropic(app, '## What you did well\n- Asked good questions.');

  const meetingId = await win.evaluate(async () => {
    const m = await window.quill.meetings.create('Coach test');
    return m.id;
  });
  await win.evaluate((id) => {
    window.location.hash = `#/meeting/${id}`;
  }, meetingId);

  const composer = win.getByTestId('chat-composer');
  await composer.fill('/coa');
  await expect(win.getByTestId('recipe-menu')).toBeVisible();
  await expect(win.getByTestId('recipe-pick-coach')).toBeVisible();
  await win.getByTestId('recipe-pick-coach').click();

  // After selection the composer should have /coach + space.
  await expect(composer).toHaveValue(/^\/coach\s*$/);
  await composer.fill('/coach review me please');
  await win.getByTestId('chat-send').click();

  const messages = win.getByTestId('chat-messages');
  await expect(messages.locator('[data-role=assistant]')).toContainText(
    'What you did well',
  );

  // Reload — the conversation should persist.
  await win.reload();
  await win.evaluate((id) => {
    window.location.hash = `#/meeting/${id}`;
  }, meetingId);
  await expect(
    win.getByTestId('chat-messages').locator('[data-role=assistant]'),
  ).toContainText('What you did well');

  await app.close();
});

test('global /chat route grounds across meetings', async () => {
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}-global`,
  ]);
  await win.evaluate(async () => {
    await window.quill.keys.set('anthropic', 'sk-ant-test');
  });
  await stubAnthropic(app, 'Across recent meetings, search was the recurring pain.');

  // Seed a couple of ended meetings so the global scope has something to ground in.
  await win.evaluate(async () => {
    const m1 = await window.quill.meetings.create('Discovery 1');
    await window.quill.meetings.saveNotes(m1.id, 'Search came up.');
    await window.quill.meetings.end(m1.id);
    const m2 = await window.quill.meetings.create('Discovery 2');
    await window.quill.meetings.saveNotes(m2.id, 'Onboarding pain.');
    await window.quill.meetings.end(m2.id);
  });

  await win.evaluate(() => {
    window.location.hash = '#/chat';
  });
  await expect(win.getByTestId('chat-composer')).toBeVisible();
  await win.getByTestId('chat-composer').fill('What is the recurring pain?');
  await win.getByTestId('chat-send').click();

  await expect(
    win.getByTestId('chat-messages').locator('[data-role=assistant]'),
  ).toContainText('search was the recurring pain');

  await app.close();
});
