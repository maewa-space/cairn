import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Meeting, Template, TranscriptEntry } from '@shared/types.js';
import type { ParsedTemplate } from '@shared/templates/parse.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dir = join(app.getPath('userData'), 'quill');
  mkdirSync(dir, { recursive: true });
  db = new Database(join(dir, 'quill.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      raw_notes TEXT NOT NULL DEFAULT '',
      enhanced_notes TEXT,
      template_id TEXT,
      folder_id TEXT
    );

    CREATE TABLE IF NOT EXISTS transcript_entries (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      speaker TEXT NOT NULL,
      text TEXT NOT NULL,
      started_at_ms INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transcript_meeting ON transcript_entries(meeting_id, started_at_ms);

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      body TEXT NOT NULL,
      built_in INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function seedTemplates(parsed: ParsedTemplate[]): void {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO templates (id, name, description, system_prompt, body, built_in, created_at)
    VALUES (@id, @name, @description, @systemPrompt, @body, 1, @createdAt)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      system_prompt = excluded.system_prompt,
      body = excluded.body
  `);
  const now = new Date().toISOString();
  const tx = d.transaction((items: ParsedTemplate[]) => {
    for (const t of items) stmt.run({ ...t, createdAt: now });
  });
  tx(parsed);
}

interface MeetingRow {
  id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  raw_notes: string;
  enhanced_notes: string | null;
  template_id: string | null;
  folder_id: string | null;
}

interface TranscriptRow {
  id: string;
  meeting_id: string;
  speaker: 'system' | 'mic';
  text: string;
  started_at_ms: number;
  duration_ms: number;
}

interface TemplateRow {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  body: string;
  built_in: number;
  created_at: string;
}

function toMeeting(row: MeetingRow, transcript: TranscriptEntry[]): Meeting {
  return {
    id: row.id,
    title: row.title,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    rawNotes: row.raw_notes,
    enhancedNotes: row.enhanced_notes,
    templateId: row.template_id,
    folderId: row.folder_id,
    transcript,
  };
}

function toTranscript(row: TranscriptRow): TranscriptEntry {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    speaker: row.speaker,
    text: row.text,
    startedAtMs: row.started_at_ms,
    durationMs: row.duration_ms,
  };
}

function toTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    systemPrompt: row.system_prompt,
    body: row.body,
    builtIn: row.built_in === 1,
    createdAt: row.created_at,
  };
}

export const meetingsRepo = {
  create(title: string): Meeting {
    const d = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    d.prepare(
      `INSERT INTO meetings (id, title, started_at, raw_notes) VALUES (?, ?, ?, '')`,
    ).run(id, title, now);
    return {
      id,
      title,
      startedAt: now,
      endedAt: null,
      rawNotes: '',
      enhancedNotes: null,
      templateId: null,
      folderId: null,
      transcript: [],
    };
  },

  list(): Meeting[] {
    const d = getDb();
    const rows = d
      .prepare(
        `SELECT * FROM meetings ORDER BY datetime(started_at) DESC LIMIT 200`,
      )
      .all() as MeetingRow[];
    return rows.map((r) => toMeeting(r, []));
  },

  get(id: string): Meeting | null {
    const d = getDb();
    const row = d.prepare(`SELECT * FROM meetings WHERE id = ?`).get(id) as
      | MeetingRow
      | undefined;
    if (!row) return null;
    const entries = d
      .prepare(
        `SELECT * FROM transcript_entries WHERE meeting_id = ? ORDER BY started_at_ms ASC`,
      )
      .all(id) as TranscriptRow[];
    return toMeeting(row, entries.map(toTranscript));
  },

  rename(id: string, title: string): void {
    getDb().prepare(`UPDATE meetings SET title = ? WHERE id = ?`).run(title, id);
  },

  saveNotes(id: string, rawNotes: string): void {
    getDb()
      .prepare(`UPDATE meetings SET raw_notes = ? WHERE id = ?`)
      .run(rawNotes, id);
  },

  end(id: string): void {
    getDb()
      .prepare(`UPDATE meetings SET ended_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);
  },

  setEnhanced(id: string, enhanced: string, templateId: string): void {
    getDb()
      .prepare(
        `UPDATE meetings SET enhanced_notes = ?, template_id = ? WHERE id = ?`,
      )
      .run(enhanced, templateId, id);
  },

  delete(id: string): void {
    getDb().prepare(`DELETE FROM meetings WHERE id = ?`).run(id);
  },

  search(query: string): Meeting[] {
    const d = getDb();
    const q = `%${query}%`;
    const rows = d
      .prepare(
        `SELECT DISTINCT m.* FROM meetings m
         LEFT JOIN transcript_entries t ON t.meeting_id = m.id
         WHERE m.title LIKE ? OR m.raw_notes LIKE ? OR m.enhanced_notes LIKE ? OR t.text LIKE ?
         ORDER BY datetime(m.started_at) DESC LIMIT 100`,
      )
      .all(q, q, q, q) as MeetingRow[];
    return rows.map((r) => toMeeting(r, []));
  },
};

export const transcriptRepo = {
  append(entry: Omit<TranscriptEntry, 'id'>): TranscriptEntry {
    const id = randomUUID();
    getDb()
      .prepare(
        `INSERT INTO transcript_entries (id, meeting_id, speaker, text, started_at_ms, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        entry.meetingId,
        entry.speaker,
        entry.text,
        entry.startedAtMs,
        entry.durationMs,
      );
    return { id, ...entry };
  },

  forMeeting(meetingId: string): TranscriptEntry[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM transcript_entries WHERE meeting_id = ? ORDER BY started_at_ms ASC`,
      )
      .all(meetingId) as TranscriptRow[];
    return rows.map(toTranscript);
  },
};

export const templatesRepo = {
  list(): Template[] {
    const rows = getDb()
      .prepare(`SELECT * FROM templates ORDER BY built_in DESC, name ASC`)
      .all() as TemplateRow[];
    return rows.map(toTemplate);
  },

  get(id: string): Template | null {
    const row = getDb().prepare(`SELECT * FROM templates WHERE id = ?`).get(id) as
      | TemplateRow
      | undefined;
    return row ? toTemplate(row) : null;
  },

  save(t: Template): void {
    getDb()
      .prepare(
        `INSERT INTO templates (id, name, description, system_prompt, body, built_in, created_at)
         VALUES (@id, @name, @description, @systemPrompt, @body, @builtInInt, @createdAt)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           system_prompt = excluded.system_prompt,
           body = excluded.body`,
      )
      .run({
        id: t.id,
        name: t.name,
        description: t.description,
        systemPrompt: t.systemPrompt,
        body: t.body,
        builtInInt: t.builtIn ? 1 : 0,
        createdAt: t.createdAt,
      });
  },

  delete(id: string): void {
    getDb()
      .prepare(`DELETE FROM templates WHERE id = ? AND built_in = 0`)
      .run(id);
  },
};

export const settingsRepo = {
  get(key: string): string | null {
    const row = getDb()
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  },

  set(key: string, value: string): void {
    getDb()
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  },
};
