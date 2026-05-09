import { BrowserWindow, app, dialog, ipcMain, shell, systemPreferences } from 'electron';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  meetingsRepo,
  transcriptRepo,
  templatesRepo,
  recipesRepo,
  foldersRepo,
  chatRepo,
  settingsRepo,
} from '../services/db.js';
import { getKey, hasKey, setKey, deleteKey, type KeyName } from '../services/keychain.js';
import { transcribe, type WhisperModel } from '../services/whisper.js';
import { enhance } from '../services/enhancer.js';
import { deriveTitle } from '../services/title.js';
import { defaultMeetingTitle } from '@shared/meeting-title.js';
import {
  runChat,
  historyToTurns,
  type ChatScope,
} from '../services/chat.js';
import {
  startAudioTap,
  stopAudioTap,
  isAudioTapRunning,
} from '../services/audio-tap.js';
import {
  openSession as openDeepgramSession,
  closeSession as closeDeepgramSession,
  sendFrame as sendDeepgramFrame,
  isSessionRunning as isDeepgramRunning,
  type DeepgramSpeaker,
} from '../services/deepgram.js';
import {
  renderMeetingPdfToFile,
  pickDefaultPageSize,
  type PdfPageSize,
} from '../services/pdf.js';
import {
  refresh as refreshCalendar,
  getStatus as getCalendarStatus,
  setIcsUrl as setCalendarUrl,
  startBackgroundRefresh,
} from '../services/calendar.js';
import { calendarRepo } from '../services/db.js';
import { detectTrigger, stripTrigger } from '@shared/recipes/parse.js';
import { deriveIssue, formatIssueDate } from '@shared/issue.js';
import type { FolderColor, Meeting, Recipe, TranscriptEntry } from '@shared/types.js';

/** Broadcast a change event to every open BrowserWindow. Used so the sidebar
 *  can listen for `meetings:changed` / `folders:changed` instead of polling
 *  every 4 seconds. Cheap — one IPC fanout per write op. */
function broadcast(channel: string, payload?: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

export function registerIpcHandlers(): void {
  // Meetings
  ipcMain.handle('meetings:list', () => meetingsRepo.list());
  ipcMain.handle('meetings:get', (_e, id: string) => meetingsRepo.get(id));
  // Plain create — calendar matching is opt-in via meetings:createWithCalendar.
  // The renderer typically passes "" or a user-typed string; an empty / blank
  // title falls back to the timestamp default ("Mon May 12 · 14:30") so the
  // sidebar doesn't show identical "Untitled" rows.
  ipcMain.handle('meetings:create', (_e, title: string) => {
    const trimmed = title.trim();
    const isAuto = trimmed.length === 0;
    const finalTitle = isAuto ? defaultMeetingTitle() : trimmed;
    const m = meetingsRepo.create(finalTitle, { titleIsAuto: isAuto });
    broadcast('meetings:changed');
    return m;
  });
  // Auto-titled create. Looks up a calendar event matching now (±10 min window),
  // and if found, uses its title + attendees. Falls back to the timestamp
  // default when nothing matches. Calendar-matched titles are also flagged as
  // auto so a later Enhance can refine if the event title is generic
  // ("Daily standup", "1:1") — a manual rename will lock it in.
  ipcMain.handle(
    'meetings:createWithCalendar',
    (_e, fallbackTitle: string) => {
      const match = calendarRepo.bestMatchAround();
      if (match) {
        const m = meetingsRepo.create(match.title, {
          calendarEventId: match.id,
          attendees: match.attendees,
          titleIsAuto: true,
        });
        broadcast('meetings:changed');
        return m;
      }
      const trimmed = fallbackTitle.trim();
      const isAuto = trimmed.length === 0;
      const m = meetingsRepo.create(
        isAuto ? defaultMeetingTitle() : trimmed,
        { titleIsAuto: isAuto },
      );
      broadcast('meetings:changed');
      return m;
    },
  );
  // Manual rename — clears the auto flag so future auto-title passes leave it alone.
  ipcMain.handle('meetings:rename', (_e, id: string, title: string) => {
    meetingsRepo.rename(id, title, { titleIsAuto: false });
    broadcast('meetings:changed');
  });
  // Transcript-based auto-titling. Runs whenever the title was Quill-
  // generated (timestamp default, calendar-matched, or a previous LLM
  // derivation) — manual renames are locked in via title_is_auto = 0 and
  // are never overwritten. Triggered on Stop recording AND after Enhance:
  // the second call benefits from the polished `enhancedNotes` content,
  // which usually carries a much sharper signal than the raw transcript.
  // Returns the new title on success, or null when nothing changed (no
  // transcript yet, no LLM key, model refused, locked-in title, etc.).
  ipcMain.handle(
    'meetings:autoTitle',
    async (_e, id: string): Promise<string | null> => {
      const meeting = meetingsRepo.get(id);
      if (!meeting) return null;
      if (!meeting.titleIsAuto) return null;
      const title = await deriveTitle({
        transcript: meeting.transcript,
        rawNotes: meeting.rawNotes,
        // Enhanced notes carry a structured summary — much better signal
        // for picking a 3-6 word title than raw transcript chunks alone.
        enhancedNotes: meeting.enhancedNotes,
        anthropicKey: getKey('anthropic'),
        openaiKey: getKey('openai'),
        openrouterKey: getKey('openrouter'),
      });
      if (!title) return null;
      // titleIsAuto stays true so a future Enhance can refine again if the
      // user adds more transcript or re-runs enhancement with a different
      // template. Cleared only by an explicit manual rename.
      meetingsRepo.rename(id, title, { titleIsAuto: true });
      broadcast('meetings:changed');
      return title;
    },
  );
  ipcMain.handle('meetings:saveNotes', (_e, id: string, raw: string) => {
    meetingsRepo.saveNotes(id, raw);
    // Notes-save fires on every keystroke debounce; do not broadcast — the
    // sidebar list rows don't show notes content.
  });
  ipcMain.handle('meetings:end', (_e, id: string) => {
    meetingsRepo.end(id);
    broadcast('meetings:changed');
  });
  ipcMain.handle('meetings:delete', (_e, id: string) => {
    meetingsRepo.delete(id);
    broadcast('meetings:changed');
  });
  ipcMain.handle('meetings:search', (_e, q: string) => meetingsRepo.search(q));

  // Transcript
  ipcMain.handle(
    'transcript:append',
    (_e, entry: Omit<TranscriptEntry, 'id'>) => transcriptRepo.append(entry),
  );
  ipcMain.handle('transcript:forMeeting', (_e, id: string) =>
    transcriptRepo.forMeeting(id),
  );

  // Templates
  ipcMain.handle('templates:list', () => templatesRepo.list());
  ipcMain.handle('templates:get', (_e, id: string) => templatesRepo.get(id));
  ipcMain.handle('templates:save', (_e, t) => templatesRepo.save(t));
  ipcMain.handle('templates:delete', (_e, id: string) =>
    templatesRepo.delete(id),
  );

  // System audio capture via AudioTee (Core Audio Tap).
  ipcMain.handle('audio-tap:start', async (_e, chunkSeconds: number) => {
    await startAudioTap(chunkSeconds);
  });
  ipcMain.handle('audio-tap:stop', async () => {
    await stopAudioTap();
  });
  ipcMain.handle('audio-tap:isRunning', () => isAudioTapRunning());

  // Deepgram streaming session — opens 2 WebSockets (mic + system) and
  // forwards PCM frames the renderer captures via AudioWorklet (mic) and
  // AudioTee (system, which already produces 16-bit PCM at 16kHz).
  ipcMain.handle(
    'deepgram:open',
    (_e, args: { meetingId: string; language?: string; diarize?: boolean }) => {
      const apiKey = getKey('deepgram');
      if (!apiKey) throw new Error('Deepgram API key not set.');
      openDeepgramSession({
        meetingId: args.meetingId,
        apiKey,
        language: args.language,
        diarize: args.diarize,
      });
    },
  );
  ipcMain.handle(
    'deepgram:frame',
    (_e, args: { speaker: DeepgramSpeaker; pcm: ArrayBuffer }) => {
      sendDeepgramFrame(args.speaker, Buffer.from(args.pcm));
    },
  );
  ipcMain.handle('deepgram:close', () => {
    closeDeepgramSession();
  });
  ipcMain.handle('deepgram:isRunning', () => isDeepgramRunning());

  // Generic settings bridge — renderer-writable keys whitelisted to keep
  // the IPC surface narrow. Calendar/keychain still use settingsRepo
  // directly via their own internal helpers.
  const RENDERER_WRITABLE_SETTINGS = new Set([
    'transcript.language',
    'transcript.diarize',
  ]);
  ipcMain.handle('settings:get', (_e, key: string): string | null => {
    if (!RENDERER_WRITABLE_SETTINGS.has(key)) return null;
    return settingsRepo.get(key);
  });
  ipcMain.handle('settings:set', (_e, key: string, value: string): void => {
    if (!RENDERER_WRITABLE_SETTINGS.has(key)) {
      throw new Error(`settings:set: key "${key}" is not renderer-writable`);
    }
    settingsRepo.set(key, value);
  });

  // Permissions (macOS TCC)
  ipcMain.handle('permissions:status', () => {
    if (process.platform !== 'darwin') {
      return { microphone: 'granted' as const, screen: 'granted' as const };
    }
    return {
      microphone: systemPreferences.getMediaAccessStatus('microphone'),
      screen: systemPreferences.getMediaAccessStatus('screen'),
    };
  });
  ipcMain.handle('permissions:askMicrophone', async () => {
    if (process.platform !== 'darwin') return true;
    return await systemPreferences.askForMediaAccess('microphone');
  });
  ipcMain.handle('permissions:openSystemSettings', (_e, pane: 'mic' | 'screen') => {
    if (process.platform !== 'darwin') return;
    const url =
      pane === 'mic'
        ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
        : 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
    shell.openExternal(url);
  });

  // Keys
  ipcMain.handle('keys:has', (_e, name: KeyName) => hasKey(name));
  ipcMain.handle('keys:set', (_e, name: KeyName, value: string) =>
    setKey(name, value),
  );
  ipcMain.handle('keys:delete', (_e, name: KeyName) => deleteKey(name));

  // Transcription
  ipcMain.handle(
    'whisper:transcribe',
    async (
      _e,
      args: {
        audio: ArrayBuffer;
        filename: string;
        model?: WhisperModel;
        language?: string;
      },
    ) => {
      const apiKey = getKey('openai');
      if (!apiKey) throw new Error('OpenAI API key not set.');
      return await transcribe({
        audio: args.audio,
        filename: args.filename,
        apiKey,
        model: args.model ?? 'whisper-1',
        language: args.language,
      });
    },
  );

  // Export markdown to file
  ipcMain.handle(
    'dialog:saveMarkdown',
    async (event, args: { suggestedName: string; content: string }) => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const safeName = args.suggestedName.replace(/[^A-Za-z0-9._ -]/g, '_').trim() || 'meeting';
      const result = await dialog.showSaveDialog(win!, {
        title: 'Export meeting notes',
        defaultPath: `${safeName}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (result.canceled || !result.filePath) return null;
      try {
        await writeFile(result.filePath, args.content, 'utf-8');
        return result.filePath;
      } catch (err) {
        // Common: read-only volume, disk full, or path no longer writable.
        // Throwing here gives the renderer a real Error message instead of
        // a generic IPC failure swallowed by an unattached promise.
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[ipc] dialog:saveMarkdown writeFile failed:', err);
        throw new Error(`Could not write ${result.filePath}: ${msg}`);
      }
    },
  );
  ipcMain.handle('dialog:revealInFinder', async (_e, path: string) => {
    shell.showItemInFolder(path);
  });

  // Export meeting as a PDF — Save dialog flow.
  ipcMain.handle(
    'dialog:savePdf',
    async (event, args: { meetingId: string; suggestedName?: string }) => {
      const meeting = meetingsRepo.get(args.meetingId);
      if (!meeting) throw new Error(`Meeting ${args.meetingId} not found.`);
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const safeName = sanitizeFileName(args.suggestedName ?? meeting.title);
      const result = await dialog.showSaveDialog(win!, {
        title: 'Export meeting as PDF',
        defaultPath: `${safeName}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (result.canceled || !result.filePath) return null;
      try {
        await renderMeetingPdfToFile(result.filePath, buildPdfInput(meeting));
        return result.filePath;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[ipc] dialog:savePdf failed:', err);
        throw new Error(`Could not write ${result.filePath}: ${msg}`);
      }
    },
  );

  // Share meeting via the macOS share sheet — renders PDF to a temp file and
  // opens it (Preview on macOS, where the user clicks the native Share button).
  // Cleanup is deferred 5 minutes — long enough for the user to drag-drop the
  // file out of Preview if they want to.
  ipcMain.handle(
    'dialog:sharePdf',
    async (_e, args: { meetingId: string }) => {
      const meeting = meetingsRepo.get(args.meetingId);
      if (!meeting) throw new Error(`Meeting ${args.meetingId} not found.`);
      const safeName = sanitizeFileName(meeting.title);
      const stamp = `${Date.now()}-${randomBytes(3).toString('hex')}`;
      const tempPath = join(tmpdir(), `quill-${safeName}-${stamp}.pdf`);
      try {
        await renderMeetingPdfToFile(tempPath, buildPdfInput(meeting));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[ipc] dialog:sharePdf render failed:', err);
        throw new Error(`Could not prepare PDF for sharing: ${msg}`);
      }
      const openErr = await shell.openPath(tempPath);
      if (openErr) {
        console.error('[ipc] dialog:sharePdf openPath failed:', openErr);
        await unlink(tempPath).catch(() => {});
        throw new Error(`Could not open PDF: ${openErr}`);
      }
      // Cleanup deferred so the user has time to share/drag.
      setTimeout(
        () => {
          unlink(tempPath).catch(() => {});
        },
        5 * 60 * 1000,
      );
      return tempPath;
    },
  );

  // Calendar (local-first ICS feed)
  ipcMain.handle('calendar:status', () => getCalendarStatus());
  ipcMain.handle('calendar:setUrl', (_e, url: string) => {
    setCalendarUrl(url);
    // Trigger an immediate refresh so the user sees their events right after
    // pasting the URL. Kick the background loop too — startBackgroundRefresh
    // is idempotent and replaces the prior interval if it was running.
    if (url.trim()) {
      startBackgroundRefresh();
    }
    return getCalendarStatus();
  });
  ipcMain.handle('calendar:refresh', async () => {
    await refreshCalendar();
    return getCalendarStatus();
  });
  ipcMain.handle('calendar:upcoming', () => calendarRepo.upcoming(new Date(), 5));
  ipcMain.handle('calendar:matchNow', () => calendarRepo.bestMatchAround());

  // Folders
  ipcMain.handle('folders:list', () => foldersRepo.list());
  ipcMain.handle('folders:create', (_e, name: string, color: FolderColor) => {
    const f = foldersRepo.create(name, color ?? null);
    broadcast('folders:changed');
    return f;
  });
  ipcMain.handle('folders:rename', (_e, id: string, name: string) => {
    foldersRepo.rename(id, name);
    broadcast('folders:changed');
  });
  ipcMain.handle('folders:setColor', (_e, id: string, color: FolderColor) => {
    foldersRepo.setColor(id, color ?? null);
    broadcast('folders:changed');
  });
  ipcMain.handle('folders:delete', (_e, id: string) => {
    foldersRepo.delete(id);
    broadcast('folders:changed');
    broadcast('meetings:changed'); // contained meetings became unfiled
  });
  ipcMain.handle('folders:meetingsIn', (_e, id: string) =>
    foldersRepo.meetingsIn(id),
  );
  ipcMain.handle(
    'meetings:moveToFolder',
    (_e, id: string, folderId: string | null) => {
      meetingsRepo.moveToFolder(id, folderId);
      broadcast('meetings:changed');
    },
  );
  ipcMain.handle('meetings:listInFolder', (_e, id: string) =>
    meetingsRepo.listInFolder(id),
  );
  ipcMain.handle('meetings:listUnfiled', () => meetingsRepo.listUnfiled());

  // Recipes
  ipcMain.handle('recipes:list', () => recipesRepo.list());
  ipcMain.handle('recipes:get', (_e, id: string) => recipesRepo.get(id));
  ipcMain.handle('recipes:save', (_e, r: Recipe) => recipesRepo.save(r));
  ipcMain.handle('recipes:delete', (_e, id: string) => recipesRepo.delete(id));

  // Chat
  ipcMain.handle(
    'chat:history',
    (
      _e,
      args: { meetingId: string | null; folderId: string | null },
    ) => {
      if (args.meetingId) return chatRepo.forMeeting(args.meetingId);
      if (args.folderId) return chatRepo.forFolder(args.folderId);
      return chatRepo.global();
    },
  );

  ipcMain.handle(
    'chat:clear',
    (
      _e,
      args: { meetingId: string | null; folderId: string | null },
    ) => {
      if (args.meetingId) chatRepo.clearForMeeting(args.meetingId);
      else if (args.folderId) chatRepo.clearForFolder(args.folderId);
      else chatRepo.clearGlobal();
    },
  );

  ipcMain.handle(
    'chat:send',
    async (
      _e,
      args: {
        meetingId: string | null;
        folderId: string | null;
        message: string;
        recipeId?: string | null;
      },
    ) => {
      const { meetingId, folderId } = args;
      let cleanedMessage = args.message.trim();
      let recipe: Recipe | null = args.recipeId
        ? recipesRepo.get(args.recipeId)
        : null;

      if (!recipe) {
        const trig = detectTrigger(cleanedMessage);
        if (trig) {
          const found = recipesRepo.getByTrigger(trig);
          if (found) {
            recipe = found;
            cleanedMessage = stripTrigger(cleanedMessage, trig);
            if (!cleanedMessage) cleanedMessage = `Apply the ${found.name} recipe.`;
          }
        }
      }

      const scope: ChatScope = resolveScope(meetingId, folderId);
      const history = meetingId
        ? chatRepo.forMeeting(meetingId)
        : folderId
          ? chatRepo.forFolder(folderId)
          : chatRepo.global();

      const userMsg = chatRepo.append({
        meetingId,
        folderId,
        role: 'user',
        content: args.message,
        recipeId: recipe?.id ?? null,
        inputTokens: null,
        outputTokens: null,
        model: null,
      });

      try {
        const result = await runChat({
          scope,
          history: historyToTurns(history),
          userMessage: cleanedMessage,
          recipe,
          anthropicKey: getKey('anthropic'),
          openaiKey: getKey('openai'),
          openrouterKey: getKey('openrouter'),
        });
        const assistantMsg = chatRepo.append({
          meetingId,
          folderId,
          role: 'assistant',
          content: result.content,
          recipeId: recipe?.id ?? null,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          model: result.modelUsed,
        });
        return { user: userMsg, assistant: assistantMsg, recipe };
      } catch (err) {
        // Persist a system-rendered error so the user sees what happened.
        const errMsg = err instanceof Error ? err.message : String(err);
        const assistantMsg = chatRepo.append({
          meetingId,
          folderId,
          role: 'assistant',
          content: `_Error:_ ${errMsg}`,
          recipeId: recipe?.id ?? null,
          inputTokens: null,
          outputTokens: null,
          model: null,
        });
        return { user: userMsg, assistant: assistantMsg, recipe, error: errMsg };
      }
    },
  );

  // Enhancement
  ipcMain.handle(
    'enhance:run',
    async (
      _e,
      args: { meetingId: string; templateId: string; rawNotes: string },
    ) => {
      const meeting = meetingsRepo.get(args.meetingId);
      if (!meeting) throw new Error(`Meeting ${args.meetingId} not found.`);
      const template = templatesRepo.get(args.templateId);
      if (!template) throw new Error(`Template ${args.templateId} not found.`);
      const result = await enhance({
        rawNotes: args.rawNotes,
        transcript: meeting.transcript,
        template,
        anthropicKey: getKey('anthropic'),
        openaiKey: getKey('openai'),
        openrouterKey: getKey('openrouter'),
      });
      meetingsRepo.setEnhanced(args.meetingId, result.markdown, args.templateId);
      broadcast('meetings:changed');
      return result;
    },
  );
}

const GLOBAL_CHAT_MEETINGS = 25;

function sanitizeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._ -]/g, '_').trim() || 'meeting';
}

function buildPdfInput(meeting: Meeting): {
  meeting: Meeting;
  issueLabel: string;
  dateLabel: string;
  pageSize: PdfPageSize;
} {
  const total = meetingsRepo.list().length;
  const ranking = meetingsRepo
    .list()
    .findIndex((m) => m.id === meeting.id);
  // Issue number reflects this meeting's position in chronological order.
  // list() returns newest-first, so the oldest meeting is the highest index.
  const indexFromOldest =
    ranking < 0 ? total : Math.max(1, total - ranking);
  const issue = deriveIssue(indexFromOldest);
  const issueLabel = `QUILL — ${issue.combined}`.toUpperCase();
  const dateLabel = formatIssueDate(
    meeting.startedAt ? new Date(meeting.startedAt) : new Date(),
  ).toUpperCase();
  let locale = 'en-US';
  try {
    locale = app.getLocale() || 'en-US';
  } catch {
    /* main process not yet ready in some test paths */
  }
  return {
    meeting,
    issueLabel,
    dateLabel,
    pageSize: pickDefaultPageSize(locale),
  };
}

function resolveScope(
  meetingId: string | null,
  folderId: string | null,
): ChatScope {
  if (meetingId) {
    const meeting = meetingsRepo.get(meetingId);
    if (!meeting) throw new Error(`Meeting ${meetingId} not found.`);
    return { kind: 'meeting', meeting };
  }
  if (folderId) {
    const folder = foldersRepo.get(folderId);
    if (!folder) throw new Error(`Folder ${folderId} not found.`);
    const meetings = meetingsRepo
      .listInFolder(folderId)
      .map((m) => meetingsRepo.get(m.id))
      .filter((m): m is NonNullable<typeof m> => m !== null);
    return { kind: 'folder', folderName: folder.name, meetings };
  }
  const meetings = meetingsRepo.recent(GLOBAL_CHAT_MEETINGS);
  return { kind: 'global', meetings };
}
