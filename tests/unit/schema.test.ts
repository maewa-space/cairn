import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../../src/main/services/schema.js';

// `better-sqlite3` is a native module rebuilt for Electron's Node ABI by the
// postinstall hook. When unit tests run on system Node it may not load — in
// that case skip rather than fail. The same SQL is exercised end-to-end by
// the Playwright tests, which run inside the real Electron binary.
let DatabaseCtor: typeof Database | null = null;
try {
  const mod = await import('better-sqlite3');
  DatabaseCtor = mod.default ?? (mod as unknown as typeof Database);
  // probe — instantiating throws on ABI mismatch
  new DatabaseCtor(':memory:').close();
} catch {
  DatabaseCtor = null;
}

describe.skipIf(DatabaseCtor === null)('schema (native sqlite)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new DatabaseCtor!(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA_SQL);
  });

  const insertMeeting = (id: string, folderId: string | null = null) => {
    db.prepare(
      `INSERT INTO meetings (id, title, started_at, raw_notes, folder_id)
       VALUES (?, ?, ?, '', ?)`,
    ).run(id, `Meeting ${id}`, new Date().toISOString(), folderId);
  };

  const insertFolder = (id: string, name = `Folder ${id}`) => {
    db.prepare(
      `INSERT INTO folders (id, name, color, created_at) VALUES (?, ?, NULL, ?)`,
    ).run(id, name, new Date().toISOString());
  };

  describe('folders', () => {
    it('preserves meetings when a folder is deleted (manual NULL-out)', () => {
      insertFolder('f1');
      insertMeeting('m1', 'f1');
      insertMeeting('m2', 'f1');
      const tx = db.transaction(() => {
        db.prepare(`UPDATE meetings SET folder_id = NULL WHERE folder_id = ?`).run('f1');
        db.prepare(`DELETE FROM folders WHERE id = ?`).run('f1');
      });
      tx();
      const remaining = db
        .prepare(`SELECT id, folder_id FROM meetings`)
        .all() as { id: string; folder_id: string | null }[];
      expect(remaining).toHaveLength(2);
      expect(remaining.every((m) => m.folder_id === null)).toBe(true);
    });

    it('moves a meeting between folders without losing it', () => {
      insertFolder('f1');
      insertFolder('f2');
      insertMeeting('m1', 'f1');
      db.prepare(`UPDATE meetings SET folder_id = ? WHERE id = ?`).run('f2', 'm1');
      const row = db.prepare(`SELECT folder_id FROM meetings WHERE id = 'm1'`).get() as
        | { folder_id: string }
        | undefined;
      expect(row?.folder_id).toBe('f2');
    });
  });

  describe('recipes', () => {
    it('rejects non-meeting/global scope values', () => {
      expect(() =>
        db
          .prepare(
            `INSERT INTO recipes (id, name, trigger, description, scope, prompt, built_in, created_at)
             VALUES ('x', 'X', 'x', '', 'invalid', 'p', 0, ?)`,
          )
          .run(new Date().toISOString()),
      ).toThrow(/CHECK constraint/i);
    });

    it('enforces unique trigger', () => {
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO recipes (id, name, trigger, description, scope, prompt, built_in, created_at)
         VALUES ('a', 'A', 'foo', '', 'meeting', 'p', 0, ?)`,
      ).run(now);
      expect(() =>
        db
          .prepare(
            `INSERT INTO recipes (id, name, trigger, description, scope, prompt, built_in, created_at)
             VALUES ('b', 'B', 'foo', '', 'meeting', 'p', 0, ?)`,
          )
          .run(now),
      ).toThrow(/UNIQUE/);
    });
  });

  describe('chat_messages', () => {
    it('cascades chat deletion when the parent meeting is deleted', () => {
      insertMeeting('m1');
      db.prepare(
        `INSERT INTO chat_messages (id, meeting_id, role, content, created_at)
         VALUES ('c1', 'm1', 'user', 'hi', ?)`,
      ).run(new Date().toISOString());
      db.prepare(`DELETE FROM meetings WHERE id = ?`).run('m1');
      const remaining = db.prepare(`SELECT * FROM chat_messages`).all();
      expect(remaining).toHaveLength(0);
    });

    it('keeps folder-scoped chat when the meeting fk is null', () => {
      insertFolder('f1');
      db.prepare(
        `INSERT INTO chat_messages (id, meeting_id, folder_id, role, content, created_at)
         VALUES ('c1', NULL, 'f1', 'user', 'hi', ?)`,
      ).run(new Date().toISOString());
      const row = db
        .prepare(`SELECT folder_id FROM chat_messages WHERE id = 'c1'`)
        .get() as { folder_id: string } | undefined;
      expect(row?.folder_id).toBe('f1');
    });
  });
});
