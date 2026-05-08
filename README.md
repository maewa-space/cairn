# Cairn

> Open-source meeting notetaker. Captures system audio + mic, transcribes via Whisper, enhances rough notes into polished writeups using AI templates.

Inspired by [Granola](https://www.granola.ai/), not affiliated.

A *cairn* is a stack of stones that marks a path. Each meeting becomes a stone in your work-cairn.

## What it does

1. **Open Cairn before a meeting** — like Apple Notes.
2. **Hit record.** Cairn captures system audio (the other people) and your mic in two tagged streams. No bots join your call.
3. **Take rough notes** while the live transcript fills the right pane.
4. **End the meeting.** Cairn merges your raw notes + transcript using a chosen template (Customer Discovery 101, User Interview, Pitch, Stand-up, 1-on-1, …) and produces a polished writeup.
5. **Audio is never stored** — only the transcript and the final notes.

## Stack

- **Electron 33** + React 18 + TypeScript 5 + Vite 5
- **Tailwind v3** + CSS custom properties (design tokens)
- **Tiptap** for the Apple-Notes-like editor
- **better-sqlite3** for local-first storage
- **OpenAI Whisper API** for transcription (chunked 20 s uploads)
- **Anthropic Claude Sonnet** for note enhancement (with prompt caching on the template prefix)
- **Electron `safeStorage`** (Keychain on macOS) for API keys
- **Vitest** + **Playwright + Electron** for tests

## Status

Pre-alpha. Built autonomously. See [build plan](#) for roadmap.

## Develop

```bash
pnpm install
pnpm dev          # launches Electron + Vite dev server
pnpm test         # vitest unit tests
pnpm test:e2e     # playwright + electron e2e
pnpm typecheck
pnpm package      # mac DMG (unsigned)
```

You'll need OpenAI and Anthropic API keys — enter them on first launch in **Settings → API Keys**. Keys are stored encrypted via macOS Keychain.

## Audio capture

On macOS 13+, system audio is captured via `getDisplayMedia({ systemAudio: 'include' })` — Chromium routes this to ScreenCaptureKit under the hood. You'll be asked once for **Screen Recording** permission. Mic is captured via `getUserMedia({ audio: true })` and asks for **Microphone** permission separately.

The two streams stay tagged throughout: grey bubbles in the transcript = others, green bubbles = you.

## Templates

Built-in templates live in `src/shared/templates/*.md`. Each is a markdown file with a system prompt header and `{{rawNotes}}` / `{{transcript}}` placeholders. Add your own in **Settings → Templates**.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

- [Granola](https://www.granola.ai/) for showing the world this product category should exist.
- [WAVE](https://github.com/maewa-space/) — internal dictation app whose Whisper + Keychain patterns informed Cairn.
- [Whisper](https://platform.openai.com/docs/guides/speech-to-text) and [Claude](https://www.anthropic.com/claude) — the AI horsepower.
