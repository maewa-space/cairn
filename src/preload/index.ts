import { contextBridge, ipcRenderer } from 'electron';
import type {
  CalendarEvent,
  ChatMessage,
  Folder,
  FolderColor,
  Meeting,
  Recipe,
  Template,
  TranscriptEntry,
  TranscribeResult,
  EnhanceResult,
} from '../shared/types.js';

export interface CalendarStatusBridge {
  url: string | null;
  lastRefreshAt: string | null;
  lastError: string | null;
  eventCount: number;
}

export interface ChatSendResult {
  user: ChatMessage;
  assistant: ChatMessage;
  recipe: Recipe | null;
  error?: string;
}

export const quillAPI = {
  meetings: {
    list: (): Promise<Meeting[]> => ipcRenderer.invoke('meetings:list'),
    get: (id: string): Promise<Meeting | null> =>
      ipcRenderer.invoke('meetings:get', id),
    create: (title: string): Promise<Meeting> =>
      ipcRenderer.invoke('meetings:create', title),
    createWithCalendar: (fallbackTitle: string): Promise<Meeting> =>
      ipcRenderer.invoke('meetings:createWithCalendar', fallbackTitle),
    rename: (id: string, title: string): Promise<void> =>
      ipcRenderer.invoke('meetings:rename', id, title),
    saveNotes: (id: string, raw: string): Promise<void> =>
      ipcRenderer.invoke('meetings:saveNotes', id, raw),
    end: (id: string): Promise<void> => ipcRenderer.invoke('meetings:end', id),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('meetings:delete', id),
    search: (q: string): Promise<Meeting[]> =>
      ipcRenderer.invoke('meetings:search', q),
    moveToFolder: (id: string, folderId: string | null): Promise<void> =>
      ipcRenderer.invoke('meetings:moveToFolder', id, folderId),
    listInFolder: (folderId: string): Promise<Meeting[]> =>
      ipcRenderer.invoke('meetings:listInFolder', folderId),
    listUnfiled: (): Promise<Meeting[]> =>
      ipcRenderer.invoke('meetings:listUnfiled'),
  },
  folders: {
    list: (): Promise<Folder[]> => ipcRenderer.invoke('folders:list'),
    create: (name: string, color: FolderColor): Promise<Folder> =>
      ipcRenderer.invoke('folders:create', name, color),
    rename: (id: string, name: string): Promise<void> =>
      ipcRenderer.invoke('folders:rename', id, name),
    setColor: (id: string, color: FolderColor): Promise<void> =>
      ipcRenderer.invoke('folders:setColor', id, color),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('folders:delete', id),
    meetingsIn: (id: string): Promise<Meeting[]> =>
      ipcRenderer.invoke('folders:meetingsIn', id),
  },
  recipes: {
    list: (): Promise<Recipe[]> => ipcRenderer.invoke('recipes:list'),
    get: (id: string): Promise<Recipe | null> =>
      ipcRenderer.invoke('recipes:get', id),
    save: (r: Recipe): Promise<void> =>
      ipcRenderer.invoke('recipes:save', r),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('recipes:delete', id),
  },
  chat: {
    history: (args: {
      meetingId: string | null;
      folderId: string | null;
    }): Promise<ChatMessage[]> => ipcRenderer.invoke('chat:history', args),
    send: (args: {
      meetingId: string | null;
      folderId: string | null;
      message: string;
      recipeId?: string | null;
    }): Promise<ChatSendResult> => ipcRenderer.invoke('chat:send', args),
    clear: (args: {
      meetingId: string | null;
      folderId: string | null;
    }): Promise<void> => ipcRenderer.invoke('chat:clear', args),
  },
  transcript: {
    append: (entry: Omit<TranscriptEntry, 'id'>): Promise<TranscriptEntry> =>
      ipcRenderer.invoke('transcript:append', entry),
    forMeeting: (id: string): Promise<TranscriptEntry[]> =>
      ipcRenderer.invoke('transcript:forMeeting', id),
  },
  templates: {
    list: (): Promise<Template[]> => ipcRenderer.invoke('templates:list'),
    get: (id: string): Promise<Template | null> =>
      ipcRenderer.invoke('templates:get', id),
    save: (t: Template): Promise<void> =>
      ipcRenderer.invoke('templates:save', t),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('templates:delete', id),
  },
  audio: {
    // Legacy: kept for compatibility with electron-audio-loopback. The
    // app now uses the AudioTee path (audioTap.*) which is reliable on
    // macOS Tahoe, but we leave these wired up in case we want to fall
    // back later.
    enableLoopback: (): Promise<void> =>
      ipcRenderer.invoke('enable-loopback-audio'),
    disableLoopback: (): Promise<void> =>
      ipcRenderer.invoke('disable-loopback-audio'),
  },
  deepgram: {
    open: (args: { meetingId: string; language?: string }): Promise<void> =>
      ipcRenderer.invoke('deepgram:open', args),
    sendFrame: (args: {
      speaker: 'mic' | 'system';
      pcm: ArrayBuffer;
    }): Promise<void> => ipcRenderer.invoke('deepgram:frame', args),
    close: (): Promise<void> => ipcRenderer.invoke('deepgram:close'),
    isRunning: (): Promise<boolean> => ipcRenderer.invoke('deepgram:isRunning'),
    onTranscript: (
      handler: (event: {
        meetingId: string;
        speaker: 'mic' | 'system';
        text: string;
        isFinal: boolean;
        startedAtMs: number;
        durationMs: number;
        detectedLanguage: string | null;
      }) => void,
    ): (() => void) => {
      const listener = (_e: unknown, payload: Parameters<typeof handler>[0]) =>
        handler(payload);
      ipcRenderer.on('deepgram:transcript', listener);
      return () => ipcRenderer.removeListener('deepgram:transcript', listener);
    },
    onState: (
      handler: (info: {
        speaker: 'mic' | 'system';
        state: string;
        code?: number;
        reason?: string;
      }) => void,
    ): (() => void) => {
      const listener = (_e: unknown, info: Parameters<typeof handler>[0]) =>
        handler(info);
      ipcRenderer.on('deepgram:state', listener);
      return () => ipcRenderer.removeListener('deepgram:state', listener);
    },
    onError: (
      handler: (info: { speaker: 'mic' | 'system'; message: string }) => void,
    ): (() => void) => {
      const listener = (_e: unknown, info: Parameters<typeof handler>[0]) =>
        handler(info);
      ipcRenderer.on('deepgram:error', listener);
      return () => ipcRenderer.removeListener('deepgram:error', listener);
    },
  },
  audioTap: {
    start: (chunkSeconds: number): Promise<void> =>
      ipcRenderer.invoke('audio-tap:start', chunkSeconds),
    stop: (): Promise<void> => ipcRenderer.invoke('audio-tap:stop'),
    isRunning: (): Promise<boolean> =>
      ipcRenderer.invoke('audio-tap:isRunning'),
    onChunk: (
      handler: (chunk: {
        wav: ArrayBuffer;
        startedAtMs: number;
        durationMs: number;
      }) => void,
    ): (() => void) => {
      const listener = (
        _e: unknown,
        payload: { wav: ArrayBuffer; startedAtMs: number; durationMs: number },
      ) => handler(payload);
      ipcRenderer.on('audio-tap:chunk', listener);
      return () => ipcRenderer.removeListener('audio-tap:chunk', listener);
    },
    onSilent: (handler: (info: { amplitude: number }) => void): (() => void) => {
      const listener = (_e: unknown, info: { amplitude: number }) =>
        handler(info);
      ipcRenderer.on('audio-tap:silent', listener);
      return () => ipcRenderer.removeListener('audio-tap:silent', listener);
    },
    onLevel: (handler: (info: { level: number }) => void): (() => void) => {
      const listener = (_e: unknown, info: { level: number }) => handler(info);
      ipcRenderer.on('audio-tap:level', listener);
      return () => ipcRenderer.removeListener('audio-tap:level', listener);
    },
  },
  permissions: {
    status: (): Promise<{
      microphone: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
      screen: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
    }> => ipcRenderer.invoke('permissions:status'),
    askMicrophone: (): Promise<boolean> =>
      ipcRenderer.invoke('permissions:askMicrophone'),
    openSystemSettings: (pane: 'mic' | 'screen'): Promise<void> =>
      ipcRenderer.invoke('permissions:openSystemSettings', pane),
  },
  keys: {
    has: (name: 'openai' | 'anthropic' | 'openrouter' | 'deepgram'): Promise<boolean> =>
      ipcRenderer.invoke('keys:has', name),
    set: (
      name: 'openai' | 'anthropic' | 'openrouter' | 'deepgram',
      value: string,
    ): Promise<void> => ipcRenderer.invoke('keys:set', name, value),
    delete: (name: 'openai' | 'anthropic' | 'openrouter' | 'deepgram'): Promise<void> =>
      ipcRenderer.invoke('keys:delete', name),
  },
  whisper: {
    transcribe: (args: {
      audio: ArrayBuffer;
      filename: string;
      model?: string;
      language?: string;
    }): Promise<string> => ipcRenderer.invoke('whisper:transcribe', args),
  },
  enhance: {
    run: (args: {
      meetingId: string;
      templateId: string;
      rawNotes: string;
    }): Promise<EnhanceResult> => ipcRenderer.invoke('enhance:run', args),
  },
  events: {
    // Subscribe to main-process broadcasts. Returns an unsubscribe fn.
    onMeetingsChanged: (handler: () => void): (() => void) => {
      const listener = () => handler();
      ipcRenderer.on('meetings:changed', listener);
      return () => ipcRenderer.removeListener('meetings:changed', listener);
    },
    onFoldersChanged: (handler: () => void): (() => void) => {
      const listener = () => handler();
      ipcRenderer.on('folders:changed', listener);
      return () => ipcRenderer.removeListener('folders:changed', listener);
    },
  },
  calendar: {
    status: (): Promise<CalendarStatusBridge> =>
      ipcRenderer.invoke('calendar:status'),
    setUrl: (url: string): Promise<CalendarStatusBridge> =>
      ipcRenderer.invoke('calendar:setUrl', url),
    refresh: (): Promise<CalendarStatusBridge> =>
      ipcRenderer.invoke('calendar:refresh'),
    upcoming: (): Promise<CalendarEvent[]> =>
      ipcRenderer.invoke('calendar:upcoming'),
    matchNow: (): Promise<CalendarEvent | null> =>
      ipcRenderer.invoke('calendar:matchNow'),
  },
  dialog: {
    saveMarkdown: (args: {
      suggestedName: string;
      content: string;
    }): Promise<string | null> =>
      ipcRenderer.invoke('dialog:saveMarkdown', args),
    revealInFinder: (path: string): Promise<void> =>
      ipcRenderer.invoke('dialog:revealInFinder', path),
    savePdf: (args: {
      meetingId: string;
      suggestedName?: string;
    }): Promise<string | null> => ipcRenderer.invoke('dialog:savePdf', args),
    sharePdf: (args: { meetingId: string }): Promise<string> =>
      ipcRenderer.invoke('dialog:sharePdf', args),
  },
};

contextBridge.exposeInMainWorld('quill', quillAPI);

export type QuillAPI = typeof quillAPI;
