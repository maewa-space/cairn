import { test, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const SHOTS = join(process.cwd(), 'docs/screenshots');

test.describe.configure({ mode: 'serial' });

let userDataDir: string;

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'quill-shots-'));
  mkdirSync(SHOTS, { recursive: true });
});

test.afterAll(() => {
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

test('captures home, meeting, settings, templates', async () => {
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.setViewportSize({ width: 1280, height: 820 });

  // Seed a few meetings so the home and sidebar look populated
  await win.evaluate(async () => {
    const a = await window.quill.meetings.create('Q3 customer discovery — Mira');
    const b = await window.quill.meetings.create('Pitch dry run with Sam');
    const c = await window.quill.meetings.create('Wednesday stand-up');
    await window.quill.transcript.append({
      meetingId: a.id,
      speaker: 'system',
      text: "We've been duct-taping Notion and Granola together for months.",
      startedAtMs: 0,
      durationMs: 4200,
    });
    await window.quill.transcript.append({
      meetingId: a.id,
      speaker: 'mic',
      text: 'And what specifically breaks when you try to share with the team?',
      startedAtMs: 4500,
      durationMs: 3300,
    });
    await window.quill.transcript.append({
      meetingId: a.id,
      speaker: 'system',
      text: "Search. Search is the worst part — I can't find anything from last quarter.",
      startedAtMs: 8000,
      durationMs: 5100,
    });
    await window.quill.meetings.saveNotes(
      a.id,
      '<h2>Pre-call hypothesis</h2><p>Mira will care about search and shareability.</p><h2>What I want to learn</h2><ul><li>Where the current tool actually breaks</li><li>What "good" looks like</li><li>Willingness to switch</li></ul>',
    );
  });

  // 1) Home — reload first so the home route hydrates with seeded meetings
  await win.reload();
  await win.evaluate(() => (window.location.hash = '#/home'));
  await win.waitForTimeout(800);
  await win.screenshot({ path: join(SHOTS, '01-home.png'), fullPage: false });

  // 2) Meeting
  const id = await win.evaluate(async () => {
    const list = await window.quill.meetings.list();
    const target = list.find((m) => m.title.includes('customer discovery')) ?? list[0];
    window.location.hash = `#/meeting/${target.id}`;
    return target.id;
  });
  await win.waitForTimeout(700);
  await win.screenshot({ path: join(SHOTS, '02-meeting.png'), fullPage: false });

  // 3) Templates
  await win.evaluate(() => (window.location.hash = '#/templates'));
  await win.waitForTimeout(500);
  await win.screenshot({ path: join(SHOTS, '03-templates.png'), fullPage: false });

  // 4) Settings
  await win.evaluate(() => (window.location.hash = '#/settings'));
  await win.waitForTimeout(400);
  await win.screenshot({ path: join(SHOTS, '04-settings.png'), fullPage: false });

  void id;
  await app.close();
});
