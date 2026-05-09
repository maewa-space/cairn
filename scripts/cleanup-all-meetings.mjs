// One-shot: delete EVERY meeting from the user's local Quill DB.
// User explicitly requested wiping all meetings. SQLite WAL mode means
// this is safe to run while Quill is open; the renderer needs a Cmd+R
// reload to refresh the now-empty sidebar.
//
// Run from project root:  node scripts/cleanup-all-meetings.mjs

import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DB_PATH = join(
  homedir(),
  'Library',
  'Application Support',
  'quill',
  'quill',
  'quill.db',
);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const before = db.prepare(`SELECT COUNT(*) as n FROM meetings`).get();
console.log(`Found ${before.n} meetings.`);

if (before.n > 0) {
  const result = db.prepare(`DELETE FROM meetings`).run();
  console.log(`Deleted ${result.changes} meetings (cascaded to children).`);
}

const after = db.prepare(`SELECT COUNT(*) as n FROM meetings`).get();
console.log(`Remaining: ${after.n}.`);
db.close();
