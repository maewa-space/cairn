import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { launchAndBypassOnboarding } from './_helpers';

let userDataDir: string;

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'quill-folder-'));
});

test.afterAll(() => {
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

test('create folder via sidebar and filter the meeting list', async () => {
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}`,
  ]);

  // Seed three meetings before creating any folder.
  const ids = await win.evaluate(async () => {
    const a = await window.quill.meetings.create('Customer A call');
    const b = await window.quill.meetings.create('Customer B call');
    const c = await window.quill.meetings.create('Internal sync');
    return [a.id, b.id, c.id];
  });

  // Create a folder named "Customers" via the sidebar UI.
  await win.getByTestId('folder-new').click();
  const input = win.getByTestId('folder-name-input');
  await expect(input).toBeVisible();
  await input.fill('Customers');
  await input.press('Enter');

  // Move customer A into the folder via main-process IPC (simulates the menu).
  const folderId = await win.evaluate(async () => {
    const list = await window.quill.folders.list();
    return list.find((f) => f.name === 'Customers')!.id;
  });
  await win.evaluate(
    async ({ id, fid }) => {
      await window.quill.meetings.moveToFolder(id, fid);
    },
    { id: ids[0], fid: folderId },
  );

  // Click the folder row in the sidebar — list should narrow to that meeting.
  await win.getByTestId(`folder-row-${folderId}`).click();
  // Wait for the periodic refresh to pick up the moved meeting.
  await expect(win.getByRole('link', { name: /Customer A call/ })).toBeVisible();
  await expect(win.getByRole('link', { name: /Internal sync/ })).not.toBeVisible();

  await app.close();
});

test('deleting a folder leaves its meetings unfiled (not deleted)', async () => {
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}-delete`,
  ]);

  const meetingId = await win.evaluate(async () => {
    const f = await window.quill.folders.create('Temp', null);
    const m = await window.quill.meetings.create('Inside temp');
    await window.quill.meetings.moveToFolder(m.id, f.id);
    await window.quill.folders.delete(f.id);
    return m.id;
  });

  // Meeting should still exist with folderId === null.
  const meeting = await win.evaluate(
    (id) => window.quill.meetings.get(id),
    meetingId,
  );
  expect(meeting?.folderId).toBeNull();
  expect(meeting?.title).toBe('Inside temp');

  // And the folder list should be empty.
  const folders = await win.evaluate(() => window.quill.folders.list());
  expect(folders).toHaveLength(0);

  await app.close();
});

test('move-to-folder submenu in MeetingActions reassigns the meeting', async () => {
  const { app, win } = await launchAndBypassOnboarding([
    '.',
    `--user-data-dir=${userDataDir}-move`,
  ]);

  const { meetingId, folderId } = await win.evaluate(async () => {
    const f = await window.quill.folders.create('Sales', null);
    const m = await window.quill.meetings.create('Lead call');
    return { meetingId: m.id, folderId: f.id };
  });

  await win.evaluate((id) => {
    window.location.hash = `#/meeting/${id}`;
  }, meetingId);

  await win.getByTestId('meeting-actions').click();
  await win.getByTestId('meeting-move-to-folder').click();
  await win.getByTestId('folder-pick-Sales').click();

  const stored = await win.evaluate(
    (id) => window.quill.meetings.get(id),
    meetingId,
  );
  expect(stored?.folderId).toBe(folderId);

  await app.close();
});
