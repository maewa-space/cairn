# Quill — Handover for next session

> **Picked-up cold? Read this top-to-bottom, then pick a sprint and start.**
> Project: open-source Granola.ai clone (Electron + React + TypeScript).
> Repo: https://github.com/maewa-space/quill — local: `/Users/amadeus/Claude-projects/notetaker/`.

---

## State as of last session (2026-05-08)

**v0.1 shipped.** DMG packaged at `release/Quill-0.1.0-arm64.dmg` (gitignored), installed in `/Applications/Quill.app`. App icon = italic serif "Q" on warm paper.

**Live-verified end-to-end** (with real OpenAI key, traces off):
- `tests/e2e/_live-pipeline.spec.ts` — Whisper transcription of two real WAV chunks (different voices, tagged system/mic) → DB persistence → GPT-4o enhancement with User Interview template → restart → meeting + enhanced notes survive. Both tests pass in ~17s.
- Earlier `_live-smoke.spec.ts` validated the same path with synthetic `say`-generated audio.

**Coverage:** 28 unit + 15 mocked e2e + 3 live (skipped without env keys). All green.

**Known gap:** Real macOS Mic + Screen Recording permission grant + native ScreenCaptureKit picker click are still user-driven (can't be automated). The pipeline downstream of capture is fully verified.

---

## Sprint 1 — Per-meeting AI Chat + `/` Recipes

> Highest impact-to-effort ratio. Every Granola review calls these out. Reuses the existing Anthropic/OpenAI/OpenRouter pipe.

### Why
- "Calm to take notes... I don't have to constantly see the transcript" — Granola's chat sits where Quill currently shows the transcript.
- "Recipes are a 10X feature" — `/`-triggered prompt templates with grounding from the current (or all) meetings.

### DB schema delta (`src/main/services/db.ts`)
```sql
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  meeting_id TEXT REFERENCES meetings(id) ON DELETE CASCADE,  -- null = global chat
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  recipe_id TEXT,
  created_at TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  model TEXT
);
CREATE INDEX idx_chat_meeting ON chat_messages(meeting_id, created_at);

CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL UNIQUE,         -- e.g. 'coach', 'follow-up'
  description TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('meeting', 'global')),
  prompt TEXT NOT NULL,
  built_in INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
```

### Built-in recipes (seed in main on startup, similar to templates)
- `/coach` (meeting) — *"Be my coach. What did I miss? What should I have asked? What did I do well?"*
- `/follow-up` (meeting) — *"Draft a follow-up email to the other person, casual professional tone, with next steps."*
- `/action-items` (meeting) — *"Extract a clean action item list with owners + due dates if mentioned."*
- `/decisions` (meeting) — *"Summarize all decisions made in this meeting in one bullet list."*
- `/objections` (meeting) — *"What objections were raised? How were they handled? What's still open?"*
- `/prep` (global) — *"Prep me for my next meeting with this person — pull last 3 meetings with them."*

Recipes live in `src/shared/recipes/*.md` with the same front-matter parser pattern as templates (`src/shared/templates/parse.ts`).

### Files to create
- `src/main/services/chat.ts` — runs chat completions with grounding (current meeting transcript or — for global scope — N most recent meetings via embedding-less keyword pre-filter).
- `src/main/services/recipes.ts` — CRUD + built-in seed loader.
- `src/main/ipc/index.ts` — add: `chat:send`, `chat:history`, `chat:clear`, `recipes:list`, `recipes:save`, `recipes:delete`.
- `src/preload/index.ts` — expose `window.quill.chat.*` and `window.quill.recipes.*`.
- `src/renderer/src/components/meeting/MeetingChat.tsx` — chat panel.
- `src/renderer/src/components/chat/RecipeMenu.tsx` — `/`-triggered popup.
- `src/renderer/src/components/chat/MessageList.tsx`, `Composer.tsx`.

### UX (Granola-style)
Replace the right-pane TranscriptStream with a tabbed pane:
- **Default tab: Chat** — composer at bottom, message list above. `/` in composer pops the recipe menu.
- **Toggle tab: Transcript** — current TranscriptStream, collapsed by default per Granola pattern.

For global chat (cross-meeting), add a route `/chat` accessible from the sidebar — same component, scope = `global`, grounds against last 25 meetings.

### Test plan
- **Unit**: `chat.ts` prompt assembly with single + global scope, recipe trigger parsing, `recipes.ts` CRUD, message persistence.
- **E2E mocked**: Send a message, verify response renders. Type `/coach` → recipe menu appears → click → assistant message uses recipe prompt (verify by mocking fetch and checking the request body).
- **Live**: Add to `_live-pipeline.spec.ts` — after enhance, send a chat message "What's the biggest pain point?", expect response mentioning "search".

### Acceptance
- [ ] Chat persists across app restart
- [ ] `/recipe-name` triggers the right prompt
- [ ] Global chat queries last 25 transcripts
- [ ] All 6 built-in recipes seeded on first run
- [ ] Recipe CRUD UI in `/templates` page (add a tab "Recipes" alongside templates)
- [ ] Live test green

---

## Sprint 2 — Folders + folder-scoped chat

> The DB column `meetings.folder_id` already exists from v0.1. Just need a folders table, UI, and chat scoping.

### DB schema delta
```sql
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,                            -- 'moss' | 'sage' | 'amber' | 'stone' | null
  created_at TEXT NOT NULL
);
-- meetings.folder_id already exists; ensure FK is enforced via PRAGMA foreign_keys.
```

### Files to create
- `src/main/services/folders.ts` — CRUD.
- `src/main/ipc/index.ts` — `folders:list`, `folders:create`, `folders:rename`, `folders:delete`, `meetings:moveToFolder`.
- `src/preload/index.ts` — `window.quill.folders.*`.
- `src/renderer/src/components/sidebar/FolderTree.tsx` — collapsible folder section in sidebar.
- Update `src/renderer/src/components/Sidebar.tsx` to render folders above meetings, with click-to-filter.
- Update `MeetingActions.tsx` with "Move to folder" submenu.

### UX
- **Sidebar**: above "Recent" — a "Folders" section. Each folder = expandable row showing meetings inside. "All meetings" + "Unfiled" pseudo-folders at the top.
- **Folder click**: filters the meeting list to that folder. Sidebar also shows a folder-scoped chat icon (links to `/chat?folder=:id`).
- **Right-click on a meeting** (or kebab menu): "Move to folder" → submenu with all folders + "Remove from folder".
- **Color**: optional accent color shown as a small dot next to the folder name.

### Test plan
- Unit: folder CRUD, meeting reassignment, cascade behavior on folder delete (meetings remain, folder_id → null).
- E2E: create folder via sidebar UI, drag/click a meeting into it, verify sidebar filters, delete folder verifies meetings are unfiled (not deleted).

### Acceptance
- [ ] Create / rename / delete folder
- [ ] Move meeting into / out of folder via UI
- [ ] Sidebar folder filter works
- [ ] Folder delete preserves meetings (foreign key behavior verified by test)
- [ ] Folder-scoped chat (depends on Sprint 1) groundings restricted to that folder's meetings

---

## How to resume

```bash
cd /Users/amadeus/Claude-projects/notetaker
pnpm install         # if needed
pnpm dev             # iterate live
pnpm test            # vitest
pnpm test:e2e        # playwright + electron
pnpm typecheck
pnpm icons           # regenerate app icon (only if redesigning)
pnpm package         # mac DMG (unsigned)
```

For live testing with real APIs:
```bash
# Don't commit any keys. Use a /tmp env file and source it inline:
cat > /tmp/quill-live-env.sh <<'EOF'
export OPENAI_API_KEY="sk-..."
export OPENROUTER_API_KEY="sk-or-..."
EOF
chmod 600 /tmp/quill-live-env.sh
( . /tmp/quill-live-env.sh && pnpm playwright test tests/e2e/_live-pipeline.spec.ts --reporter=list )
rm /tmp/quill-live-env.sh
```

The user's keys from this session **must be rotated before next session** — they were embedded in chat history. Generate new ones at:
- https://platform.openai.com/api-keys
- https://openrouter.ai/keys

Then enter them once in **Settings → OpenAI / Anthropic / OpenRouter** in the running Quill app.

---

## Reference architecture (key files)

```
src/
├── main/                                  # Electron main process
│   ├── index.ts                           # window + permission + getDisplayMedia handler
│   ├── ipc/index.ts                       # all IPC handlers — extend here for chat/recipes/folders
│   └── services/
│       ├── db.ts                          # better-sqlite3, migrations, repos
│       ├── keychain.ts                    # safeStorage wrapper
│       ├── whisper.ts                     # OpenAI /v1/audio/transcriptions multipart POST
│       └── enhancer.ts                    # Anthropic preferred → OpenAI → OpenRouter fallback
├── preload/index.ts                       # contextBridge: window.quill.*
├── renderer/src/
│   ├── App.tsx                            # routes + FirstRunGate
│   ├── routes/                            # home, meeting, settings, templates, onboarding
│   ├── components/                        # Shell, Sidebar, meeting/, templates/
│   ├── hooks/                             # useAudioCapture, useChunkedTranscriber
│   └── lib/                               # date, html, markdown
└── shared/
    ├── types.ts                           # Meeting, Template, TranscriptEntry, Settings
    └── templates/                         # 6 built-in markdown templates + parse.ts + loaders

tests/
├── unit/                                  # whisper, enhancer, templates, html, markdown
└── e2e/
    ├── smoke.spec.ts                      # home, new meeting, templates list
    ├── record-flow.spec.ts                # transcript IPC, settings keychain
    ├── meeting-actions.spec.ts            # copy, delete, export
    ├── template-crud.spec.ts              # custom template CRUD
    ├── onboarding-flow.spec.ts            # finish path, back-navigation
    ├── dmg-smoke.spec.ts                  # launches packaged DMG
    ├── screenshots.spec.ts                # generates docs/screenshots/
    ├── _helpers.ts                        # launchAndBypassOnboarding
    ├── _live-smoke.spec.ts                # gitignored, env-driven
    └── _live-pipeline.spec.ts             # gitignored, env-driven
```

## Anti-patterns to avoid (learned this session)

- `audio: 'loopback'` in `setDisplayMediaRequestHandler` callback is **Windows-only**. On macOS, set `useSystemPicker: true` so the OS picker handles audio routing via ScreenCaptureKit.
- Properties on `window.quill.*` are read-only via `contextBridge` — you can't stub them in Playwright with `evaluate`. Stub at the main-process level via `electronApp.evaluate(({ dialog, shell }, ...) => { dialog.showSaveDialog = ... })`.
- `addInitScript` doesn't fire on hash navigations in HashRouter. Inject stubs via `evaluate` after navigation.
- `process.resourcesPath/templates` is the packaged location for built-in templates — `extraResources` in electron-builder.yml copies `src/shared/templates/*.md` there.
- Live tests must `test.use({ trace: 'off', video: 'off' })` so credentials never persist into Playwright artifacts.
