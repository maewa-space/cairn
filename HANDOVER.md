# Quill — Handover for next session

> **Picked-up cold? Read this top-to-bottom.** Deepgram streaming + reconnect
> resilience, design audit polish, and a forest-didone icon all shipped this
> week. The "Queued for next session" block at the top is the active punch
> list — two items left before this is production.
> Project: open-source Granola.ai clone (Electron + React + TypeScript).
> Repo: https://github.com/maewa-space/quill — local: `/Users/amadeus/Claude-projects/notetaker/`.

---

## Queued for next session — two items, no blockers

Reconnect-and-resume landed 2026-05-09 (later session). The remaining two
items were deferred at end of the prior session — pick them up cold.

### 1. Deepgram-side diarization (single conversation, speaker labels)

**Where:** `src/main/services/deepgram.ts` URL builder + the renderer's
TranscriptStream rendering.
**Today:** we open two separate WebSockets — one per channel (mic +
system) — so speakers are tagged by channel: "YOU" (mic) or "OTHER"
(system). That works for a 1-on-1 call but conflates everyone on the
"other" side into a single voice.
**Want:** option to merge to one socket with `multichannel=true&diarize=true`
so Deepgram returns proper speaker labels (Speaker 0, Speaker 1, …).
**Approach sketch:**
- Encode mic + system as a stereo PCM stream in the renderer (interleave
  Int16 frames: L = mic, R = system) and ship one WebSocket.
- URL flags: `&channels=2&multichannel=true&diarize=true`.
- Deepgram returns events with a `channel_index` + `speaker` field. Map
  `speaker=N` to "You", "Person 2", "Person 3", … (the user's voice should
  always be on channel 0 = "You").
- Setting in Settings → Calendar/Audio: "Diarize multi-speaker calls
  (Deepgram)" toggle. Default off (current channel-tag behavior is fine
  for 1-on-1).
- TranscriptStream needs a wider speaker-tag enum than `'mic' | 'system'`
  — extend to `'mic' | 'system' | 'speaker-N'`.

### 2. Language picker UI

**Where:** Settings page + `useChunkedTranscriber` + `useStreamingCapture` +
`src/main/services/deepgram.ts` URL builder.
**Today:** all language is auto-detect — the Whisper REST call omits
`language`, the Deepgram WS omits the `&language=` query param. Should
work for English / German / Spanish / French / Italian / Portuguese /
Dutch via Nova-3's auto-detect.
**Want:** explicit language picker in Settings (Auto + the 12-15 most
common locales). Stored in `settings` table at
`transcript.language` (existing settingsRepo). Read at meeting mount.
**Approach sketch:**
- Generic `settings:get` / `settings:set` IPC + preload bridge (currently
  only `keys:*` is exposed; calendar reuses internal keys directly).
- Settings page: a select dropdown above the Calendar card. Options:
  Auto, English, German, Spanish, French, Italian, Portuguese, Dutch,
  Japanese, Mandarin, Korean, Hindi, Russian, Polish.
- Pass the resolved code (`undefined` for Auto) into both transcribers.
- `deepgram.ts` `buildUrl()` already honors `language` — just thread it
  through `openSession({ language })`.

---

## State as of 2026-05-09 (end of session)

**Everything ships green.**

- **77 unit tests** pass (vitest) — was 71 + 6 Deepgram parser tests
- **21 mocked e2e** pass (playwright + electron) — unchanged
- **3 DMG smoke** pass against the packaged app
- **typecheck** clean (`tsc --noEmit` on both `tsconfig.node.json` and `tsconfig.web.json`)
- **production build** clean (`pnpm build`; ~1.28 MB JS, ~52 KB CSS, fonts self-hosted as woff2 chunks)

The packaged `.app` is signed `space.maewa.quill` and ships an AudioTee Swift binary as `extraResources` for system audio. Runs offline (Whisper) or via Deepgram WS streaming when the user sets a `dg-…` key.

---

## What shipped today (2026-05-09, later session)

### Deepgram WebSocket reconnect-and-resume

A network blip or Deepgram idle timeout no longer needs the user to hit
Stop and Start again. The channel reconnects transparently with backoff
and replays the last ~3s of buffered PCM so the transcript continues from
where it dropped.

- `src/main/services/deepgram.ts` — `openChannel` extracted into a
  `DeepgramChannel` class with internal state: bounded ring buffer (96 KB
  ≈ 3s of 16kHz mono Int16, headroom for the worst-case 250+500+1000+2000ms
  reconnect window), `closed` flag set only on user-initiated `closeSession()`,
  reconnect counter with exponential backoff `[250, 500, 1000, 2000]ms` and
  a hard cap of 4 attempts. On reconnect 'open', the buffer drains to the
  new socket. After the budget is exhausted, the channel surfaces a
  terminal `deepgram:error` ("disconnected after 4 reconnect attempts").
- WebSocket factory injection — `__setWsFactoryForTesting` swaps the `ws`
  module for a fake WS in unit tests so we can drive open/close/error/
  message events deterministically without a live socket.
- `src/preload/index.ts` — `onState` payload widened to include
  `attempt` + `max` so a future UI could show "reconnecting (2/4)".
- `src/renderer/src/hooks/useStreamingCapture.ts` — tracks per-channel
  reconnect state from `deepgram:state` events and exposes a single
  `reconnecting: boolean` to the UI. Cleared on `reconnected` / `open` /
  `closed`. The shared shape on `useAudioCapture` (Whisper batch path) gets
  a `reconnecting: false` so meeting.tsx doesn't have to fork its UI.
- `RecordControls.tsx` — quiet italic "reconnecting…" microcopy with a
  spinner sits next to the elapsed timer when `reconnecting === true`.
  No error banner during the cycle (transient `ws.error` events are
  suppressed mid-reconnect; only the terminal failure surfaces).
- 6 new unit tests in `tests/unit/deepgram-reconnect.test.ts` cover
  backoff timing, frame replay, user-close suppression, terminal error
  after budget exhaustion, buffer eviction cap, and transient-error
  suppression. Tests use `vi.useFakeTimers()` + a fake `WsLike` so they
  run in milliseconds.

**Test count:** 77 → 83 unit tests, 21 e2e unchanged.

---

## What shipped earlier today (2026-05-09, first session)

### Deepgram streaming transcription

When a Deepgram API key is set in Settings, transcription flips from chunked Whisper REST to streaming WebSocket. Granola-style cadence — text flows in continuously with an italic-muted "LIVE" ghost paragraph showing what's still being recognized.

- `src/main/services/deepgram.ts` — opens two WebSockets (one per channel: mic + system) with `model=nova-3, encoding=linear16, sample_rate=16000, interim_results=true, smart_format=true, endpointing=300`. Forwards each PCM frame as raw Linear16. Parses `Results` events into `{text, isFinal, startedAtMs, durationMs, detectedLanguage}` and broadcasts via IPC.
- `src/main/services/audio-tap.ts` — when `isDeepgramRunning()`, AudioTee's PCM frames go straight to Deepgram in-process (skipping the WAV chunking + IPC round-trip).
- `src/renderer/src/worklets/pcm-processor.js` — AudioWorkletProcessor downsamples Float32 mic audio to 16kHz Int16 PCM. Loaded as a raw asset via Vite's `?url` import (inlines as data URI).
- `src/renderer/src/hooks/useStreamingCapture.ts` — `getUserMedia` → `AudioContext` → `AudioWorkletNode` → IPC frame to main → WS. Subscribes to `deepgram:transcript` events and persists finals via `transcript.append` so reload survives.
- `src/renderer/src/components/meeting/TranscriptStream.tsx` + `RightPane.tsx` — interim text renders as a ghost paragraph at the foot of the column.
- `meeting.tsx` checks `keys.has('deepgram')` once at mount and picks the pipeline. Whisper batch path stays as fallback.
- 6 unit tests for `parseDeepgramMessage` covering finals / `speech_final` / empty / malformed / language detection.

**Cost:** Nova-3 streaming ≈ $0.46/hr; Nova-2 ≈ $0.35/hr; Whisper-1 batch (current fallback) ≈ $0.36/hr. Streaming is roughly cost-parity, not a premium.

### Cadence improvements (Whisper batch path)

- `useAudioCapture` chunkSeconds: `10 → 5` — halves the latency from "you finished a sentence" to "the transcript shows it" on the fallback Whisper path.
- Removed the `language: 'en'` pin in `meeting.tsx` — the RMS gate now drops silent chunks before they hit Whisper, so auto-detect is safe and German / Spanish / French / etc. transcribe in their language. Comment in the source flags the language picker as queued work.
- `TranscriptStream.tsx` — coalesces consecutive same-speaker entries within 4s into a single flowing paragraph. Visual rhythm now reads more like Granola.

### App icon — v3 forest didone (final)

Iterated through three directions; v3 is the locked one.

1. **v1**: glossy iOS-26 moss-gradient squircle with white italic Q.
2. **v2**: warm paper background, hairline moss frame, italic Newsreader Q in moss (rejected as "weird green" + "boring").
3. **v3 (current)**: solid forest squircle (`#1f3a2c → #11241c`), cream Playfair Display 900 Q at full bleed. Picked from a 12-design portfolio + 10-color palette review (`scripts/icon-options.mjs`, `scripts/icon-colors.mjs`, output cached at `~/Downloads/quill-icon-options/`).

The brand `--moss` token in `tokens.css` simultaneously shifted from `52% 0.085 145` (acidic spring green) → `31% 0.06 158` (deep forest, slightly bluer). PDF template, in-app `<QuillMark>` component, FolderTree sage swatch, and every `oklch(var(--moss))` consumer all auto-track. Dock icon and in-app accents read as one coherent green.

### Design audit polish

- **Animated submenus + dropdowns** (140ms fade+y) via a new `<MenuPanel>` wrapper. Action menu, Export submenu, Folder submenu, template picker, recipe menu all animate now.
- **Editorial banner pattern replaces `window.alert()`** in `MeetingActions` for PDF/share/copy/export errors. Auto-dismisses at 5s. `EXPORTED · 14:09` moss dateline ghost confirms successful exports (4s fade).
- **ARIA fixes**: `FolderTree` IconBtn became a real `<button>` with descriptive labels ("Rename folder Q3 Reviews", etc.); `role="menu"` / `menuitem` / `menuitemradio` on dropdowns; `role="status"` + `aria-live="polite"` on chat thinking + meeting save banner; `aria-expanded` + `aria-haspopup` on the meeting-actions trigger; Esc-to-close on action menu and template picker.
- **Event-driven sidebar** — replaced the 4s polling interval with main-process broadcasts (`meetings:changed`, `folders:changed`). Sidebar + FolderTree subscribe via `window.quill.events.onMeetingsChanged / onFoldersChanged`.
- **Templates + recipes responsive** — below 820px the panes collapse to a horizontal scroll-strip picker (`NarrowPicker`) with moss underline on active.
- **Active hairline on Raw/Enhanced toggle** — moss `border-b-2` on Enhanced, ink on Raw, `aria-pressed` for screen readers.
- **Calendar empty-state microcopy** — "connected · no upcoming meetings on the wire" (italic) when `eventCount === 0`.
- **`document.title` per route** — meeting route shows the live title in the window chrome.

### Sidebar list compaction

Compact single-line rows (title + relative-time stamp on the right) instead of the previous two-line title-and-meta layout. About 2× more meetings fit in the same vertical space. Scroll gutter is now reserved (`overflow-y: scroll`) so the area doesn't shift width when the list overflows. New helper `formatRelativeShort` in `lib/date.ts` produces `now / 12m / 5h / 3d / 8w / May 8` stamps.

### Sidebar overflow containment (load-bearing — read this if you touch Shell/Sidebar)

The aside is a CSS grid item, and grid items default to `min-height: auto` — meaning they grow to their content's intrinsic height instead of respecting the row's `h-screen`. With ~30+ meetings in the list, the aside spilled past the viewport, the body got a vertical scrollbar, and macOS traffic-lights ended up overlapping the FolderTree (because the titlebar-drag region scrolled away with the sidebar content).

Fix locked in 996dbd2:
- Aside (full + drawer variants) gets `h-full min-h-0 overflow-hidden`. Now strictly bounded to its grid row; only the inner flex-1 list scrolls.
- Every static row in `SidebarBody` gets `shrink-0`: New Meeting button, search, FolderTree wrapper, eyebrow, nav-row footer, Vol/Issue counter, titlebar-drag.

**Anti-pattern to avoid:** removing any of those `shrink-0` classes or removing `min-h-0 overflow-hidden` from the aside. The flex math collapses immediately and the body grows a scrollbar again.

---

## What shipped earlier (2026-05-08, second session)

### PDF + Markdown export with native sharing

- `src/main/services/pdf-template.ts` renders an editorial HTML document
  (masthead, serif title, drop cap, mono dateline, italic Newsreader footer)
  with Newsreader/Inter/JetBrains Mono embedded as base64 woff2. Cache hits
  the file system once at first call.
- `src/main/services/pdf.ts` spawns a hidden BrowserWindow, loads the HTML
  via a temp file, awaits `document.fonts.ready` + 120 ms settle, and calls
  `printToPDF` with `displayHeaderFooter: true`. European locales get A4
  with 18 mm margins; everywhere else gets Letter with 0.75 in margins.
- New IPC: `dialog:savePdf` (Save dialog → render → write), `dialog:sharePdf`
  (render to `os.tmpdir()` → `shell.openPath` → 5-min deferred unlink).
- `MeetingActions` got an "Export →" submenu (PDF / Markdown) plus a separate
  "Share…" item. New testids: `export-submenu`, `export-pdf`, `export-md`,
  `share-pdf`. Existing folder-submenu pattern preserved.
- Shared utilities lifted to `src/shared/`: `markdown.ts`, `issue.ts`,
  `meeting-export.ts`. Old renderer imports re-export from there.
- 11 new unit tests in `tests/unit/pdf-template.test.ts`. Two new e2e tests
  in `meeting-actions.spec.ts` exercise the real `printToPDF` pipeline and
  the share path with a stubbed `shell.openPath`.

### Window responsiveness + mobile widths

- New hook `useMediaQuery` and shared `BREAKPOINTS` (`compactSidebar` 900px,
  `narrowBody` 820px, `mobile` 560px).
- `Shell` renders one of three layouts: full sidebar (≥900px), 64-px icon
  rail with overlay drawer (560–900px), or stacked-with-bottom-bar mobile
  layout (<560px).
- `Sidebar` factored into `CompactRail` + `SidebarBody`; the drawer animates
  in via the existing `fade-up` keyframe and is closed on route change /
  outside click.
- Meeting page top bar wraps via `flex-wrap` so RecordControls + EnhanceBar
  + actions never clip. Below 820 px the right pane folds behind a "Notes /
  Chat & transcript" tab toggle (testid `body-tabs`, `body-tab-notes`,
  `body-tab-side`).
- Routes (`home`, `meeting`, `settings`, `templates`, `onboarding`) all use
  `px-5 sm:px-10`. `Masthead` wraps at narrow widths.
- BrowserWindow `minWidth` lowered from 940 → 420, `minHeight` 620 → 540.

### Calendar integration + auto-titling

- Local-first: paste an ICS feed URL (Google, Outlook, iCloud, Fastmail,
  Calendly all expose one) or a local `.ics` file path. **No OAuth.**
- `src/shared/ics.ts` — minimal RFC 5545 VEVENT parser: line unfolding,
  DATE-TIME (UTC + local) and DATE-only forms, ATTENDEE/ORGANIZER with CN
  display names, escaped commas/semicolons/newlines. Skips RRULE expansion
  (recurring events ship as individual VEVENTs from most feeds anyway).
- `src/main/services/calendar.ts` — fetches the URL via `fetch()` (or
  `readFile` for `file://` and bare paths), parses, replaces the
  `calendar_events` table for source `primary` in one transaction. Drops
  events that ended >7 days ago. Background refresh every 30 minutes.
- New schema: `calendar_events` table + `meetings.calendar_event_id` and
  `meetings.attendees` (JSON array) columns added via idempotent
  `POST_SCHEMA_MIGRATIONS`.
- New IPC: `calendar:status`, `calendar:setUrl`, `calendar:refresh`,
  `calendar:upcoming`, `calendar:matchNow`, `meetings:createWithCalendar`.
- Settings page got a "Calendar" section with `CalendarCard`: paste URL,
  Save, Refresh, last-sync line, error surface. Testids: `calendar-url-input`,
  `calendar-url-save`, `calendar-refresh`, `calendar-feedback`.
- The "Start meeting" CTAs in `home` and `Sidebar` call
  `meetings.createWithCalendar(...)` so an active calendar event auto-fills
  the title and attendees. Attendee chips render in the meeting header
  dateline (testid `meeting-attendees`).
- 6 new unit tests in `tests/unit/ics.test.ts`.

---

## What shipped on 2026-05-08 (first session)

### Editorial design revamp — 6 phases + 6 quick wins

The app no longer reads as a generic Tailwind/shadcn template. Visual direction is **editorial newspaper / journal** — masthead chrome, hairline rule-lines, mono datelines, italic-Newsreader microcopy, drop cap on enhanced notes, moss left-rule for active sidebar/folder/template rows.

Key utilities now in `src/renderer/src/styles/global.css` (use these, don't reinvent):

| Class | Use |
|---|---|
| `.eyebrow` | Tracked uppercase Inter at 11px, `text-ink-soft`. Section labels. |
| `.dateline` | Mono small-caps with tabular-nums. Meta lines like "WED · 14:02 · 38 MIN · 4 VOICES". |
| `.microcopy` | Italic Newsreader `text-ink-muted`. Ephemeral states ("polishing…", "thinking…", "An empty shelf — for now.") |
| `.rule` / `.rule-vert` | 1px hairlines bound to `--edge` token. |
| `.card-elevated` | Single soft shadow + hover lift. (Plain `.card` left unchanged so the e2e selector at `record-flow.spec.ts:88` still matches.) |
| `.editor-prose--enhanced` | Modifier on `EnhancedView` that turns on the moss drop-cap on the first paragraph. |

Reusable component: `<Masthead left="Quill — Vol. I · Issue 23" right="Wed, May 8, 2026" />` at `src/renderer/src/components/Masthead.tsx`. Used on Home, Settings, Onboarding.

Issue derivation: `deriveIssue(meetingCount)` and `formatIssueDate()` at `src/renderer/src/lib/issue.ts`. Sidebar foot shows `Vol. I · Issue N` in italic Newsreader as a quiet delight.

### Self-hosted variable fonts

Newsreader, Inter, JetBrains Mono ship via `@fontsource-variable/*` packages. **Before today the app was rendering Georgia + system-ui as fallback** — fonts were referenced in CSS but never imported. All three are now in `src/renderer/src/styles/fonts.css` and bound to `--font-{serif,sans,mono}` tokens.

### Motion via the `motion` package (~5KB tree-shaken)

Three keyframes in `src/renderer/src/styles/tokens.css`: `pulse-soft`, `breathe`, `fade-up`.

Active animations:
- `RedDot` 3-layer pulsing dot (live recording indicator) in `RecordControls.tsx`
- Breathe on chat thinking dot + meeting-load skeleton
- motion-one stagger fade-up on home meeting list mount
- Slide on Raw ↔ Enhanced view toggle in `meeting.tsx`
- Soft fade on chat-message append in `MessageList.tsx`
- Soft fade on transcript-entry append in `TranscriptStream.tsx`
- Route fade-up in `Shell.tsx` on every pathname change

`@media (prefers-reduced-motion: reduce)` global rule in `global.css` collapses every animation to ~0ms. Verified against macOS System Settings → Accessibility → Display → Reduce motion.

Import path: `import { animate, inView, stagger } from 'motion';` (the `motion/dom` subpath isn't a valid types entry in v12).

### OpenRouter is now the default-preferred provider

Both `enhancer.ts` and `chat.ts` reorder their provider chain to `[openrouter, anthropic, openai]`. Default OpenRouter model is `anthropic/claude-haiku-4.5` — cheap-but-capable. Anthropic and OpenAI remain as fallbacks when no OpenRouter key is set.

Settings + onboarding copy was updated to lead with OpenRouter as recommended; Anthropic surfaces only in Settings as the optional full-Sonnet upgrade.

New unit test in `tests/unit/enhancer.test.ts` locks "OpenRouter preferred when all three keys set" in.

### Onboarding revised

- Step 1: editorial headline matching home ("Note every meeting. *Polish it later.*"); bullets restyled with full-size moss icons + serif titles + rule-line separators.
- Step 2: **fixed inaccurate copy.** Was telling users to grant Screen Recording, but Quill uses AudioTee Core Audio Tap which needs the macOS Sequoia "System Audio Recording" permission (split out from Screen Recording). New copy explicitly references that flow.
- Step 3: leads with OpenRouter as recommended cheap path.

E2E test `tests/e2e/onboarding-flow.spec.ts` updated to match — was asserting on old text/testids.

### App icon redesigned (v3 — current)

Iterated through three directions in successive sessions:

1. **v1**: glossy iOS-26 moss-gradient squircle with white italic Q (initial).
2. **v2**: warm paper background, hairline moss frame, oversized italic Newsreader Q in moss (editorial first pass — user rejected as "weird green" + "boring").
3. **v3 (current)**: solid forest squircle (`#1f3a2c → #11241c`), cream Playfair Display 900 Q at full bleed. Picked from a 12-design portfolio + 10-color palette review (`scripts/icon-options.mjs`, `scripts/icon-colors.mjs`, output cached at `~/Downloads/quill-icon-options/`).

The brand `--moss` token in `tokens.css` was simultaneously shifted from `52% 0.085 145` (acidic spring green) → `31% 0.06 158` (deep forest, slightly bluer) so the Dock icon and every in-app accent (drop cap, active sidebar/folder rule, chat user-message rule, transcript stream border, onboarding bullet icons) all share the same green. Dark-mode `--moss` follows: `70% 0.085 158`.

The PDF template at `src/main/services/pdf-template.ts` mirrors this token (lines 117–127) — keep them in sync on any future brand change or PDF exports will visually drift from the app.

In-app `<QuillMark>` (`src/renderer/src/components/ui/QuillMark.tsx`) is a tiny SVG echo of the Dock icon used in the Sidebar header + drawer header. Uses bundled Newsreader 800 (Playfair would require an extra font import for one glyph at 20px).

### Silent-failure audit fixes

Earlier in the session the silent-failure-hunter agent found 8 places where errors were dropped without logging or surfacing. All HIGH + MEDIUM items fixed:

- `keychain.ts` decrypt failures now log the real cause; user no longer sees misleading "key not configured" when the blob is corrupt.
- `db.ts` migrate wraps in try/catch that surfaces the db path + recovery hint; partial init no longer cached.
- `meeting.tsx` shows an error UI on load failure (was rendering "Loading…" forever); notes-save errors surface a dismissible banner.
- `dialog:saveMarkdown` writeFile failures throw real Errors with the path.
- `useAudioCapture.ts` empty catches replaced with logs; recorder-restart failure marks the loop dead so UI stops claiming "recording".

### Audio capture (still load-bearing — read this if you touch audio)

The `getDisplayMedia` path was abandoned because macOS Sequoia/Tahoe TCC + ScreenCaptureKit hangs silently when the app is ad-hoc signed. Replaced with **AudioTee** (a Swift Core Audio Tap binary).

- `src/main/services/audio-tap.ts` — main-process AudioTee wrapper. Spawns the binary, accumulates 16-bit PCM into 10s WAV chunks, IPCs to renderer as `audio-tap:chunk`. **Gates silent chunks** with RMS < 0.005 and emits `audio-tap:silent` after 3 consecutive silent chunks at capture start (= permission probably denied; mid-capture quiet doesn't trigger anymore).
- `src/renderer/src/hooks/useAudioCapture.ts` — orchestrates mic (`getUserMedia` + rolling MediaRecorder) and system (audio-tap subscription). **Mic-side RMS gate at 0.01** drops silent chunks before sending to Whisper.
- `src/shared/hallucination.ts` — pattern set for Whisper's silent-input hallucinations: long YouTube outros, standalone "Thank you.", emoji spam, common non-English silence drift (Swedish/Spanish/Russian).
- `src/renderer/src/hooks/useChunkedTranscriber.ts` — Whisper queue. Pinned to `language: 'en'` in `meeting.tsx` to stop language drift.
- `build/entitlements.mac.plist` + `scripts/after-sign.cjs` — required because we run `hardenedRuntime: true`. Re-signs the freshly-packaged `.app` with `--identifier space.maewa.quill --entitlements --options runtime --deep`. Also signs the nested AudioTee binary first (extraResources isn't covered by `--deep`).

### Sprints 1 + 2 (shipped earlier — context for new session)

- **Sprint 1**: Per-meeting AI Chat + slash recipes. Tables `recipes`, `chat_messages`. 6 built-in recipes (`coach`, `follow-up`, `action-items`, `decisions`, `objections`, `prep`). RightPane (`Chat` default + `Transcript` toggle).
- **Sprint 2**: Folders. `folders` table + `meetings.folder_id`. Delete-folder NULL-outs `folder_id`. `FolderTree` collapsible sidebar with All/Unfiled, color cycle, rename/delete, per-folder chat link. `MeetingActions` "Move to folder…" submenu.

---

## Queued for next session

The big-three queued items from the previous handover (PDF/share, calendar +
auto-titling, responsiveness) all shipped this session. Remaining gaps from
the Granola feature-parity research:

1. **Inline citations in chat** — Granola's flagship Apr 2026 feature. Quill
   stores the transcript already; a citation overlay would attach
   `[mm:ss → mm:ss]` references to each chat assistant turn. Open question:
   pass cited spans inline in the assistant prompt schema, or post-process
   the response against the transcript via fuzzy match? Recommend the
   structured-output approach with strict-mode JSON.
2. **FTS5 + people/companies index** — replace the `LIKE %q%` substring
   search in `meetingsRepo.search` with `CREATE VIRTUAL TABLE meetings_fts
   USING fts5(...)`. Now that we have `attendees`, build a `people` view that
   counts meetings per person and exposes a `/sidebar/people` browse mode.
3. **More templates** — Quill has 6 vs Granola's 29-40. Easy win, just
   editorial work in `src/shared/templates/`.
4. **Public link sharing** — out of scope for local-first. The native
   share-sheet path delivered this session covers Mail / Messages / AirDrop
   for any Apple Mail / iMessage / Slack / Notion paste flow.

The Sidebar drawer currently doesn't ship its own e2e test; consider adding
one that resizes the BrowserWindow below 900 px and asserts the icon rail +
overlay flow.

**Out of scope (user explicitly deferred earlier):** MCP server,
public-link sharing.

---

## How to resume

```bash
cd /Users/amadeus/Claude-projects/notetaker
pnpm install          # if needed
pnpm dev              # iterate live (uses dev binary path for audiotee)
pnpm test             # vitest
pnpm test:e2e         # playwright + electron
pnpm typecheck
pnpm icons            # regenerate app icon
pnpm package          # mac DMG (unsigned, after-sign hook re-signs with bundle id)
```

**Install the latest packaged build:**
```bash
osascript -e 'quit app "Quill"' 2>/dev/null
rm -rf /Applications/Quill.app
pnpm package
hdiutil attach release/Quill-0.1.0-arm64.dmg
cp -R "/Volumes/Quill 0.1.0-arm64/Quill.app" /Applications/
hdiutil detach "/Volumes/Quill 0.1.0-arm64"
# Reset Quill's TCC so prompts re-fire (NEVER reset all apps' TCC)
tccutil reset Microphone space.maewa.quill 2>/dev/null
tccutil reset ScreenCapture space.maewa.quill 2>/dev/null
open /Applications/Quill.app
```

After install, the user must:
1. Allow Microphone when prompted (or System Settings → Privacy & Security → Microphone → enable Quill).
2. Open Settings → Privacy & Security → **Screen & System Audio Recording**, scroll to **System Audio Recording Only**, click `+`, add Quill. (Toggling under "Screen Recording" alone is NOT enough on macOS Sequoia/Tahoe.)
3. Quit + relaunch.

For live testing with real APIs:
```bash
cat > /tmp/quill-live-env.sh <<'EOF'
export OPENAI_API_KEY="sk-..."
export OPENROUTER_API_KEY="sk-or-..."
EOF
chmod 600 /tmp/quill-live-env.sh
( . /tmp/quill-live-env.sh && pnpm playwright test tests/e2e/_live-pipeline.spec.ts --reporter=list )
rm /tmp/quill-live-env.sh
```

**Rotate any keys ever pasted into chat.**

---

## Granola feature-parity research — 2026-05-08

A `general-purpose` deep-research agent ran against `granola.ai` and surfaced their full feature inventory. Top findings worth keeping in head:

| Feature | Granola has | Quill has |
|---|---|---|
| System audio capture, no bot | ✅ | ✅ AudioTee |
| Enhance + 29-40 templates | ✅ | 🟡 6 templates + custom |
| Slash recipes / lenses | ✅ Apr 2026 became agentic with citations | ✅ 6 + custom |
| Per-meeting / cross-meeting chat | ✅ | ✅ |
| Inline citations in chat | ✅ Apr 2026 | 🔴 |
| Calendar integration + auto-titling + attendee detection | ✅ Google + MS Jan 2026 | ✅ via local-first ICS feed |
| FTS / people-companies index | ✅ "lightning fast" | 🟡 substring only |
| Sharing: Slack, Notion, public link, email | ✅ | ✅ PDF + native macOS share sheet (this session) + markdown |
| MCP server | ✅ Feb 2026 | 🔴 (user said no MCP for now) |
| Open source / local-first / BYO-key | 🔴 | ✅ Quill's moat |

After the export plan ships, the highest-leverage next builds are:
1. **Calendar integration + auto-titling** (single biggest UX gap; unlocks attendee detection + people graph)
2. **FTS5 + people/companies index** (cheap, removes daily "where did I say X" pain)
3. **Inline citations + cross-meeting RAG** (Granola's flagship 2026 feature; Quill differentiates by being open source)
4. **Recipe & template marketplace as a Git repo** (open-source-native answer; community moat)

User asked clarifying questions about calendar / auto-titling earlier in this session, hasn't committed to building them.

---

## Anti-patterns to avoid (learned this session and earlier)

- `audio: 'loopback'` in `setDisplayMediaRequestHandler` is **Windows-only**. macOS uses `useSystemPicker: true`. We've abandoned this path entirely in favor of AudioTee.
- `getDisplayMedia` is unreliable on macOS Sequoia/Tahoe with stale TCC entries — silent hang, no error.
- `getMediaAccessStatus('screen')` lies. Don't rely on it for branching logic.
- `hardenedRuntime: true` without an entitlements plist breaks `getUserMedia` (`NotFoundError`). Always pair with `build/entitlements.mac.plist`.
- electron-builder's ad-hoc sign produces `Identifier=Electron`, colliding with every other Electron app in TCC. Re-sign with `--identifier <bundleId>` in afterSign.
- `extraResources` binaries are NOT covered by `codesign --deep`. Sign them explicitly first.
- `audiotee` is pure-ESM. Use `await import('audiotee')`, not `require()` or `createRequire`.
- MediaRecorder `start(timeslice)` produces fragmented chunks. Use rolling stop+restart.
- Whisper hallucinates on silent or instrumental audio. Always RMS-gate before sending; always filter known patterns after.
- Properties on `window.quill.*` are read-only via `contextBridge` — can't be stubbed in Playwright via `evaluate`. Stub at main-process level via `electronApp.evaluate(...)`.
- `addInitScript` doesn't fire on hash navigations in HashRouter. Use `evaluate` after navigation.
- Live tests must `test.use({ trace: 'off', video: 'off' })` so credentials never persist into Playwright artifacts.
- `motion` package's `motion/dom` subpath isn't a valid types entry — import from `'motion'` directly. Tree-shaker drops the React parts.
- `record-flow.spec.ts:88` selects `div.card` on the Settings keys page. Don't remove the `.card` class even if you flatten its visual treatment.
- Don't introduce new colors, font stacks, or motion primitives. Bind to existing tokens (`--moss`, `--ink-*`, `--surface-*`, `--duration-*`, `--ease-*`) and existing keyframes (`pulse-soft`, `breathe`, `fade-up`).

---

## Reference architecture

```
src/
├── main/
│   ├── index.ts                              # window + permission + audio-loopback init
│   ├── ipc/index.ts                          # all IPC — folders, recipes, chat, audio-tap, dialog:*
│   └── services/
│       ├── audio-tap.ts                      # AudioTee Swift binary wrapper (system audio)
│       ├── chat.ts                           # chat completions — OpenRouter preferred default
│       ├── db.ts                             # better-sqlite3 + migrations + repos
│       ├── enhancer.ts                       # OpenRouter → Anthropic → OpenAI fallback
│       ├── keychain.ts                       # safeStorage wrapper, decrypt errors logged
│       ├── schema.ts                         # SQL DDL extracted for testing
│       └── whisper.ts                        # OpenAI /v1/audio/transcriptions
├── preload/index.ts                          # window.quill.* (audioTap, chat, recipes, folders, dialog, ...)
├── renderer/src/
│   ├── App.tsx
│   ├── routes/                               # home (masthead), meeting (skeleton + slide), settings (masthead), templates, onboarding (revised), chat
│   ├── components/
│   │   ├── Masthead.tsx                      # NEW — editorial chrome
│   │   ├── Shell.tsx                         # route fade-up
│   │   ├── Sidebar.tsx                       # moss left-rule active state, italic issue counter at foot
│   │   ├── chat/                             # MessageList (column not bubbles), Composer (underline only)
│   │   ├── meeting/                          # RecordControls (pulsing RedDot), TranscriptStream (column), EnhancedView (drop cap), RightPane, MeetingActions, EnhanceBar
│   │   ├── sidebar/FolderTree.tsx            # moss left-rule active state
│   │   └── templates/                        # TemplateForm, RecipeForm
│   ├── hooks/
│   │   ├── useAudioCapture.ts                # mic + audio-tap; mic RMS gate at 0.01; recorder-restart failure marks loop dead
│   │   └── useChunkedTranscriber.ts          # Whisper queue + hallucination filter
│   ├── lib/
│   │   ├── date.ts
│   │   ├── issue.ts                          # deriveIssue, formatIssueDate
│   │   └── markdown.ts
│   └── styles/
│       ├── fonts.css                         # @fontsource-variable imports
│       ├── global.css                        # .eyebrow .dateline .microcopy .rule .card-elevated drop-cap reduced-motion
│       └── tokens.css                        # OKLCH tokens + 3 keyframes + font vars
└── shared/
    ├── types.ts
    ├── recipes/                              # 6 built-in markdown recipes + parse + loaders
    ├── templates/                            # 6 built-in markdown templates + parse + loaders
    └── hallucination.ts                      # Whisper hallucination patterns + tests

build/entitlements.mac.plist                  # audio-input + JIT + library-validation off
build/icon.svg                                # editorial: warm paper + moss hairline frame + serif Q
scripts/after-sign.cjs                        # re-sign with bundle id + entitlements + nested binaries
scripts/build-icons.mjs                       # SVG → iconset → icns
electron-builder.yml                          # extraResources: audiotee binary
```

---

## Memory pointers

The session's memory at `~/.claude/projects/-Users-amadeus-Claude-projects-notetaker/memory/` includes:

- `project_quill.md` — open-source Granola clone overview
- `project_quill_editorial_revamp.md` — what shipped today, with reuse points
- `project_quill_export_plan.md` — pointer to the queued plan file
- `project_quill_audio_open_issue.md` — silent-input hallucinations (fixed, awaiting live verification)
- `feedback_quill_design.md` — editorial direction the user signed off
- `feedback_macos_entitlements.md` — hardenedRuntime + entitlements coupling
- `feedback_quill_audio_capture.md` — AudioTee architecture
- `reference_wave_app.md` — predecessor Swift dictation app patterns
- `MEMORY.md` — index, auto-loaded into every conversation

A fresh session in this project will pick all of those up automatically. The export plan at `~/.claude/plans/quill-export-pdf-md-shareable.md` is referenced from `project_quill_export_plan.md`.
