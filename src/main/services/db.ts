import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type {
  ChatMessage,
  Folder,
  FolderColor,
  Meeting,
  Recipe,
  RecipeScope,
  Speaker,
  Template,
  TranscriptEntry,
} from '@shared/types.js';
import type { ParsedTemplate } from '@shared/templates/parse.js';
import type { ParsedRecipe } from '@shared/recipes/parse.js';
import { POST_SCHEMA_MIGRATIONS, SCHEMA_SQL } from './schema.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dir = join(app.getPath('userData'), 'quill');
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, 'quill.db');
  let opened: Database.Database;
  try {
    opened = new Database(dbPath);
    opened.pragma('journal_mode = WAL');
    opened.pragma('foreign_keys = ON');
    migrate(opened);
  } catch (err) {
    // Don't cache a partially-initialised handle — every subsequent IPC call
    // would otherwise return a half-broken db. Surface the path so the user
    // can locate the corrupt file in their userData dir.
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Quill database init failed at ${dbPath}: ${msg}. If the file is corrupt, quit Quill and remove it — meetings will be lost but the app will start.`,
    );
  }
  db = opened;
  return db;
}

function migrate(d: Database.Database): void {
  d.exec(SCHEMA_SQL);
  // Idempotent column additions for tables that existed before the new
  // calendar columns were introduced. Each migration is skipped if the
  // column already exists, so this is safe to run on every boot.
  for (const m of POST_SCHEMA_MIGRATIONS) {
    const cols = d
      .prepare(`PRAGMA table_info(${m.table})`)
      .all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === m.column)) {
      d.exec(m.ddl);
    }
  }
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
  calendar_event_id: string | null;
  attendees: string;
}

interface TranscriptRow {
  id: string;
  meeting_id: string;
  // SQLite stores the raw speaker tag (mic / system / speaker-N) as TEXT.
  // The wider TypeScript Speaker union covers diarized labels.
  speaker: Speaker;
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
  let attendees: string[] = [];
  try {
    const parsed = JSON.parse(row.attendees ?? '[]');
    if (Array.isArray(parsed)) {
      attendees = parsed.filter((s): s is string => typeof s === 'string');
    }
  } catch {
    // Stored value isn't JSON — fall back to empty list and let the next
    // attendee write rewrite it cleanly.
  }
  return {
    id: row.id,
    title: row.title,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    rawNotes: row.raw_notes,
    enhancedNotes: row.enhanced_notes,
    templateId: row.template_id,
    folderId: row.folder_id,
    calendarEventId: row.calendar_event_id ?? null,
    attendees,
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

export interface CreateMeetingOptions {
  calendarEventId?: string | null;
  attendees?: string[];
}

export const meetingsRepo = {
  create(title: string, options: CreateMeetingOptions = {}): Meeting {
    const d = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    const attendeesJson = JSON.stringify(options.attendees ?? []);
    d.prepare(
      `INSERT INTO meetings (id, title, started_at, raw_notes, calendar_event_id, attendees)
       VALUES (?, ?, ?, '', ?, ?)`,
    ).run(id, title, now, options.calendarEventId ?? null, attendeesJson);
    return {
      id,
      title,
      startedAt: now,
      endedAt: null,
      rawNotes: '',
      enhancedNotes: null,
      templateId: null,
      folderId: null,
      calendarEventId: options.calendarEventId ?? null,
      attendees: options.attendees ?? [],
      transcript: [],
    };
  },

  setCalendarLink(id: string, eventId: string | null, attendees: string[]): void {
    getDb()
      .prepare(
        `UPDATE meetings SET calendar_event_id = ?, attendees = ? WHERE id = ?`,
      )
      .run(eventId, JSON.stringify(attendees), id);
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

  moveToFolder(id: string, folderId: string | null): void {
    getDb()
      .prepare(`UPDATE meetings SET folder_id = ? WHERE id = ?`)
      .run(folderId, id);
  },

  listInFolder(folderId: string): Meeting[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM meetings WHERE folder_id = ? ORDER BY datetime(started_at) DESC LIMIT 200`,
      )
      .all(folderId) as MeetingRow[];
    return rows.map((r) => toMeeting(r, []));
  },

  listUnfiled(): Meeting[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM meetings WHERE folder_id IS NULL ORDER BY datetime(started_at) DESC LIMIT 200`,
      )
      .all() as MeetingRow[];
    return rows.map((r) => toMeeting(r, []));
  },

  recent(limit: number): Meeting[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM meetings WHERE ended_at IS NOT NULL
         ORDER BY datetime(started_at) DESC LIMIT ?`,
      )
      .all(limit) as MeetingRow[];
    return rows.map((r) => {
      const entries = getDb()
        .prepare(
          `SELECT * FROM transcript_entries WHERE meeting_id = ? ORDER BY started_at_ms ASC`,
        )
        .all(r.id) as TranscriptRow[];
      return toMeeting(r, entries.map(toTranscript));
    });
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

interface FolderRow {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

interface RecipeRow {
  id: string;
  name: string;
  trigger: string;
  description: string;
  scope: RecipeScope;
  prompt: string;
  built_in: number;
  created_at: string;
}

interface ChatMessageRow {
  id: string;
  meeting_id: string | null;
  folder_id: string | null;
  role: 'user' | 'assistant';
  content: string;
  recipe_id: string | null;
  created_at: string;
  input_tokens: number | null;
  output_tokens: number | null;
  model: string | null;
}

function toFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    color: (row.color as FolderColor) ?? null,
    createdAt: row.created_at,
  };
}

function toRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    name: row.name,
    trigger: row.trigger,
    description: row.description,
    scope: row.scope,
    prompt: row.prompt,
    builtIn: row.built_in === 1,
    createdAt: row.created_at,
  };
}

function toChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    folderId: row.folder_id,
    role: row.role,
    content: row.content,
    recipeId: row.recipe_id,
    createdAt: row.created_at,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    model: row.model,
  };
}

export function seedRecipes(parsed: ParsedRecipe[]): void {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO recipes (id, name, trigger, description, scope, prompt, built_in, created_at)
    VALUES (@id, @name, @trigger, @description, @scope, @prompt, 1, @createdAt)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      trigger = excluded.trigger,
      description = excluded.description,
      scope = excluded.scope,
      prompt = excluded.prompt
  `);
  const now = new Date().toISOString();
  const tx = d.transaction((items: ParsedRecipe[]) => {
    for (const r of items) stmt.run({ ...r, createdAt: now });
  });
  tx(parsed);
}

export const foldersRepo = {
  list(): Folder[] {
    const rows = getDb()
      .prepare(`SELECT * FROM folders ORDER BY name COLLATE NOCASE ASC`)
      .all() as FolderRow[];
    return rows.map(toFolder);
  },

  get(id: string): Folder | null {
    const row = getDb()
      .prepare(`SELECT * FROM folders WHERE id = ?`)
      .get(id) as FolderRow | undefined;
    return row ? toFolder(row) : null;
  },

  create(name: string, color: FolderColor = null): Folder {
    const id = randomUUID();
    const now = new Date().toISOString();
    getDb()
      .prepare(`INSERT INTO folders (id, name, color, created_at) VALUES (?, ?, ?, ?)`)
      .run(id, name, color, now);
    return { id, name, color, createdAt: now };
  },

  rename(id: string, name: string): void {
    getDb().prepare(`UPDATE folders SET name = ? WHERE id = ?`).run(name, id);
  },

  setColor(id: string, color: FolderColor): void {
    getDb().prepare(`UPDATE folders SET color = ? WHERE id = ?`).run(color, id);
  },

  delete(id: string): void {
    const d = getDb();
    const tx = d.transaction(() => {
      d.prepare(`UPDATE meetings SET folder_id = NULL WHERE folder_id = ?`).run(id);
      d.prepare(`DELETE FROM folders WHERE id = ?`).run(id);
    });
    tx();
  },

  meetingsIn(folderId: string): Meeting[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM meetings WHERE folder_id = ? ORDER BY datetime(started_at) DESC`,
      )
      .all(folderId) as MeetingRow[];
    return rows.map((r) => toMeeting(r, []));
  },
};

export const recipesRepo = {
  list(): Recipe[] {
    const rows = getDb()
      .prepare(`SELECT * FROM recipes ORDER BY built_in DESC, name COLLATE NOCASE ASC`)
      .all() as RecipeRow[];
    return rows.map(toRecipe);
  },

  get(id: string): Recipe | null {
    const row = getDb().prepare(`SELECT * FROM recipes WHERE id = ?`).get(id) as
      | RecipeRow
      | undefined;
    return row ? toRecipe(row) : null;
  },

  getByTrigger(trigger: string): Recipe | null {
    const row = getDb()
      .prepare(`SELECT * FROM recipes WHERE trigger = ?`)
      .get(trigger) as RecipeRow | undefined;
    return row ? toRecipe(row) : null;
  },

  save(r: Recipe): void {
    getDb()
      .prepare(
        `INSERT INTO recipes (id, name, trigger, description, scope, prompt, built_in, created_at)
         VALUES (@id, @name, @trigger, @description, @scope, @prompt, @builtInInt, @createdAt)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           trigger = excluded.trigger,
           description = excluded.description,
           scope = excluded.scope,
           prompt = excluded.prompt`,
      )
      .run({
        id: r.id,
        name: r.name,
        trigger: r.trigger,
        description: r.description,
        scope: r.scope,
        prompt: r.prompt,
        builtInInt: r.builtIn ? 1 : 0,
        createdAt: r.createdAt,
      });
  },

  delete(id: string): void {
    getDb().prepare(`DELETE FROM recipes WHERE id = ? AND built_in = 0`).run(id);
  },
};

export const chatRepo = {
  append(message: Omit<ChatMessage, 'id' | 'createdAt'>): ChatMessage {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO chat_messages
         (id, meeting_id, folder_id, role, content, recipe_id, created_at, input_tokens, output_tokens, model)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        message.meetingId,
        message.folderId,
        message.role,
        message.content,
        message.recipeId,
        createdAt,
        message.inputTokens,
        message.outputTokens,
        message.model,
      );
    return { id, createdAt, ...message };
  },

  forMeeting(meetingId: string): ChatMessage[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM chat_messages WHERE meeting_id = ? ORDER BY datetime(created_at) ASC`,
      )
      .all(meetingId) as ChatMessageRow[];
    return rows.map(toChatMessage);
  },

  forFolder(folderId: string): ChatMessage[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM chat_messages WHERE folder_id = ? AND meeting_id IS NULL
         ORDER BY datetime(created_at) ASC`,
      )
      .all(folderId) as ChatMessageRow[];
    return rows.map(toChatMessage);
  },

  global(): ChatMessage[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM chat_messages WHERE meeting_id IS NULL AND folder_id IS NULL
         ORDER BY datetime(created_at) ASC`,
      )
      .all() as ChatMessageRow[];
    return rows.map(toChatMessage);
  },

  clearForMeeting(meetingId: string): void {
    getDb()
      .prepare(`DELETE FROM chat_messages WHERE meeting_id = ?`)
      .run(meetingId);
  },

  clearForFolder(folderId: string): void {
    getDb()
      .prepare(
        `DELETE FROM chat_messages WHERE folder_id = ? AND meeting_id IS NULL`,
      )
      .run(folderId);
  },

  clearGlobal(): void {
    getDb()
      .prepare(
        `DELETE FROM chat_messages WHERE meeting_id IS NULL AND folder_id IS NULL`,
      )
      .run();
  },
};

interface CalendarEventRow {
  id: string;
  uid: string;
  title: string;
  starts_at: string;
  ends_at: string;
  attendees: string;
  location: string | null;
  description: string | null;
  source: string;
  fetched_at: string;
}

function toCalendarEvent(
  row: CalendarEventRow,
): import('@shared/types.js').CalendarEvent {
  let attendees: string[] = [];
  try {
    const parsed = JSON.parse(row.attendees);
    if (Array.isArray(parsed)) {
      attendees = parsed.filter((s): s is string => typeof s === 'string');
    }
  } catch {
    /* fall through with empty list */
  }
  return {
    id: row.id,
    uid: row.uid,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    attendees,
    location: row.location,
    description: row.description,
    source: row.source,
    fetchedAt: row.fetched_at,
  };
}

export interface UpsertCalendarEventInput {
  uid: string;
  title: string;
  startsAt: string;
  endsAt: string;
  attendees: string[];
  location: string | null;
  description: string | null;
  source: string;
}

export const calendarRepo = {
  /** Replace all events for a given source in one transaction. Atomic so
   *  partial failures can't leave stale events behind. */
  replaceForSource(source: string, events: UpsertCalendarEventInput[]): number {
    const d = getDb();
    const now = new Date().toISOString();
    const insert = d.prepare(
      `INSERT INTO calendar_events
         (id, uid, title, starts_at, ends_at, attendees, location, description, source, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(uid, source) DO UPDATE SET
         title = excluded.title,
         starts_at = excluded.starts_at,
         ends_at = excluded.ends_at,
         attendees = excluded.attendees,
         location = excluded.location,
         description = excluded.description,
         fetched_at = excluded.fetched_at`,
    );
    const tx = d.transaction((items: UpsertCalendarEventInput[]) => {
      d.prepare(`DELETE FROM calendar_events WHERE source = ?`).run(source);
      for (const e of items) {
        insert.run(
          randomUUID(),
          e.uid,
          e.title,
          e.startsAt,
          e.endsAt,
          JSON.stringify(e.attendees),
          e.location,
          e.description,
          e.source,
          now,
        );
      }
    });
    tx(events);
    return events.length;
  },

  /** Events whose [startsAt, endsAt] window is currently active given `now`. */
  activeNow(now: Date = new Date()): import('@shared/types.js').CalendarEvent[] {
    const iso = now.toISOString();
    const rows = getDb()
      .prepare(
        `SELECT * FROM calendar_events
         WHERE datetime(starts_at) <= datetime(?) AND datetime(ends_at) > datetime(?)
         ORDER BY datetime(starts_at) ASC`,
      )
      .all(iso, iso) as CalendarEventRow[];
    return rows.map(toCalendarEvent);
  },

  /** Best single match for "right now" — looks for events that start within
   *  ±N minutes of now (default 10) and prefers the one whose start is
   *  closest to now. Used for auto-titling new meetings. */
  bestMatchAround(
    now: Date = new Date(),
    windowMinutes = 10,
  ): import('@shared/types.js').CalendarEvent | null {
    const lower = new Date(now.getTime() - windowMinutes * 60_000).toISOString();
    const upper = new Date(now.getTime() + windowMinutes * 60_000).toISOString();
    const nowIso = now.toISOString();
    const rows = getDb()
      .prepare(
        `SELECT * FROM calendar_events
         WHERE datetime(starts_at) BETWEEN datetime(?) AND datetime(?)
            OR (datetime(starts_at) <= datetime(?) AND datetime(ends_at) > datetime(?))
         ORDER BY ABS(strftime('%s', starts_at) - strftime('%s', ?)) ASC
         LIMIT 1`,
      )
      .all(lower, upper, nowIso, nowIso, nowIso) as CalendarEventRow[];
    return rows[0] ? toCalendarEvent(rows[0]) : null;
  },

  /** Upcoming events (starting after now) — for the home page hint. */
  upcoming(now: Date = new Date(), limit = 5): import('@shared/types.js').CalendarEvent[] {
    const iso = now.toISOString();
    const rows = getDb()
      .prepare(
        `SELECT * FROM calendar_events
         WHERE datetime(starts_at) > datetime(?)
         ORDER BY datetime(starts_at) ASC LIMIT ?`,
      )
      .all(iso, limit) as CalendarEventRow[];
    return rows.map(toCalendarEvent);
  },

  countForSource(source: string): number {
    const row = getDb()
      .prepare(`SELECT COUNT(*) as n FROM calendar_events WHERE source = ?`)
      .get(source) as { n: number } | undefined;
    return row?.n ?? 0;
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
