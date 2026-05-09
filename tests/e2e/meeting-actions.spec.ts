import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { launchAndBypassOnboarding } from './_helpers';

let userDataDir: string;

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'quill-actions-'));
});

test.afterAll(() => {
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

async function gotoMeeting(
  win: import('@playwright/test').Page,
  title: string,
  notesHtml = '',
): Promise<string> {
  const id = await win.evaluate(
    async ({ t, html }) => {
      const m = await window.quill.meetings.create(t);
      if (html) await window.quill.meetings.saveNotes(m.id, html);
      return m.id;
    },
    { t: title, html: notesHtml },
  );
  await win.evaluate((mid) => {
    window.location.hash = `#/meeting/${mid}`;
  }, id);
  await expect(win.getByTestId('meeting-title')).toHaveValue(title);
  return id;
}

test('copy as markdown writes the right shape to clipboard', async () => {
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}-copy`,
  ]);

  await gotoMeeting(
    win,
    'Q3 customer interview',
    '<h2>Hypothesis</h2><p>Search is the pain.</p><ul><li>What breaks?</li><li>How often?</li></ul>',
  );

  // Stub clipboard now (after navigation, before action).
  await win.evaluate(() => {
    (window as unknown as { __clipboard: string[] }).__clipboard = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (s: string) => {
          (window as unknown as { __clipboard: string[] }).__clipboard.push(s);
          return Promise.resolve();
        },
        readText: () => Promise.resolve(''),
      },
      configurable: true,
    });
  });

  await win.getByTestId('meeting-actions').click();
  await win.getByText('Copy as Markdown').click();

  const copied = await win.evaluate(
    () =>
      (window as unknown as { __clipboard: string[] }).__clipboard.slice(-1)[0],
  );
  expect(copied).toBeTruthy();
  expect(copied).toContain('# Q3 customer interview');
  expect(copied).toContain('## Hypothesis');
  expect(copied).toContain('Search is the pain.');
  expect(copied).toContain('- What breaks?');

  await app.close();
});

test('delete confirms and routes back to home', async () => {
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}-del`,
  ]);

  await gotoMeeting(win, 'To be deleted');

  // Stub confirm just before clicking
  await win.evaluate(() => {
    window.confirm = () => true;
  });

  // Capture the meeting id from the URL hash for later DB check
  const id = await win.evaluate(() =>
    window.location.hash.replace('#/meeting/', ''),
  );

  await win.getByTestId('meeting-actions').click();
  await win.getByText('Delete meeting').click();

  // Back on home (Sidebar's "New meeting" button is a button, but home shows start-new-meeting)
  await expect(win.getByTestId('start-new-meeting')).toBeVisible();

  const stillThere = await win.evaluate(
    async (mid) => await window.quill.meetings.get(mid),
    id,
  );
  expect(stillThere).toBeNull();

  await app.close();
});

test('export → markdown hits dialog and writes file', async () => {
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}-export`,
  ]);

  const exportPath = join(userDataDir, `export-${Date.now()}.md`);

  // Stub native showSaveDialog and shell.showItemInFolder in the MAIN process,
  // since contextBridge freezes window.quill.* on the renderer side.
  await app.evaluate(async ({ dialog, shell }, p: string) => {
    dialog.showSaveDialog = (async () => ({
      canceled: false,
      filePath: p,
    })) as unknown as typeof dialog.showSaveDialog;
    shell.showItemInFolder = (() => {
      // no-op for tests
    }) as unknown as typeof shell.showItemInFolder;
  }, exportPath);

  await gotoMeeting(win, 'Exported meeting', '<p>note body</p>');

  await win.getByTestId('meeting-actions').click();
  await win.getByTestId('export-submenu').click();
  await win.getByTestId('export-md').click();

  // Wait for the file to land
  await expect
    .poll(() => existsSync(exportPath), { timeout: 5000 })
    .toBe(true);

  const content = readFileSync(exportPath, 'utf-8');
  expect(content).toContain('# Exported meeting');
  expect(content).toContain('note body');

  await app.close();
});

test('export → pdf renders a real PDF via printToPDF', async () => {
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}-pdf`,
  ]);

  const exportPath = join(userDataDir, `export-${Date.now()}.pdf`);

  // Stub the Save dialog and Reveal-in-Finder; the actual PDF rendering goes
  // through the real printToPDF code path so this test exercises the full
  // template + offscreen-window pipeline.
  await app.evaluate(async ({ dialog, shell }, p: string) => {
    dialog.showSaveDialog = (async () => ({
      canceled: false,
      filePath: p,
    })) as unknown as typeof dialog.showSaveDialog;
    shell.showItemInFolder = (() => {
      // no-op for tests
    }) as unknown as typeof shell.showItemInFolder;
  }, exportPath);

  await gotoMeeting(
    win,
    'PDF Roundtrip',
    '<h2>Decisions</h2><p>Ship the editorial PDF.</p>',
  );

  await win.getByTestId('meeting-actions').click();
  await win.getByTestId('export-submenu').click();
  await win.getByTestId('export-pdf').click();

  await expect
    .poll(() => existsSync(exportPath), { timeout: 20000 })
    .toBe(true);

  const buf = readFileSync(exportPath);
  // PDFs always begin with %PDF- and are at minimum a few KB once a real page
  // has rendered. If the file is suspiciously tiny we caught a stub leak.
  expect(buf.byteLength).toBeGreaterThan(2048);
  expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');

  await app.close();
});

test('share → pdf hands a temp PDF to shell.openPath', async () => {
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}-share`,
  ]);

  // Stub shell.openPath in the main process so we don't actually launch
  // Preview during tests, and capture what was called.
  await app.evaluate(async ({ shell }) => {
    interface SharedRecord {
      paths: string[];
    }
    const g = global as unknown as { __qShared?: SharedRecord };
    g.__qShared = { paths: [] };
    shell.openPath = (async (p: string) => {
      g.__qShared!.paths.push(p);
      return '';
    }) as unknown as typeof shell.openPath;
  });

  await gotoMeeting(win, 'Sharable meeting', '<p>quick brief</p>');

  await win.getByTestId('meeting-actions').click();
  await win.getByTestId('share-pdf').click();

  // Wait for the share IPC to settle. The handler renders the PDF in main,
  // calls shell.openPath, then resolves.
  const calls = await app.evaluate(async () => {
    const start = Date.now();
    while (Date.now() - start < 20000) {
      const g = global as unknown as { __qShared?: { paths: string[] } };
      if (g.__qShared && g.__qShared.paths.length > 0) {
        return g.__qShared.paths;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return [];
  });

  expect(calls.length).toBeGreaterThan(0);
  const sharedPath = calls[0];
  expect(sharedPath.endsWith('.pdf')).toBe(true);

  // Confirm the PDF was actually written to the temp path before openPath.
  expect(existsSync(sharedPath)).toBe(true);
  const buf = readFileSync(sharedPath);
  expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');

  await app.close();
});
