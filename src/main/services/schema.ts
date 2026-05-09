// SQL schema lives in its own module so it can be exercised by unit tests
// without pulling in electron. db.ts uses the same string.

export const SCHEMA_SQL = `
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

  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    trigger TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('meeting', 'global')),
    prompt TEXT NOT NULL,
    built_in INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    meeting_id TEXT REFERENCES meetings(id) ON DELETE CASCADE,
    folder_id TEXT,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    recipe_id TEXT,
    created_at TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    model TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_chat_meeting ON chat_messages(meeting_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_folder ON chat_messages(folder_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_global ON chat_messages(created_at)
    WHERE meeting_id IS NULL AND folder_id IS NULL;

  CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    title TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    attendees TEXT NOT NULL DEFAULT '[]',
    location TEXT,
    description TEXT,
    source TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_calendar_events_window ON calendar_events(starts_at, ends_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_uid ON calendar_events(uid, source);
`;

/** Idempotent column additions (alter-ifexists style) for migrations after
 *  initial schema. SQLite doesn't support `ADD COLUMN IF NOT EXISTS`, so we
 *  inspect pragma table_info first. Caller must invoke from inside getDb(). */
export const POST_SCHEMA_MIGRATIONS: Array<{
  table: string;
  column: string;
  ddl: string;
}> = [
  {
    table: 'meetings',
    column: 'calendar_event_id',
    ddl: `ALTER TABLE meetings ADD COLUMN calendar_event_id TEXT`,
  },
  {
    table: 'meetings',
    column: 'attendees',
    ddl: `ALTER TABLE meetings ADD COLUMN attendees TEXT NOT NULL DEFAULT '[]'`,
  },
];
