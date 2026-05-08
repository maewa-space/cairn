import { contextBridge, ipcRenderer } from 'electron';
import type {
  Meeting,
  Template,
  TranscriptEntry,
  TranscribeResult,
  EnhanceResult,
} from '../shared/types.js';

export const quillAPI = {
  meetings: {
    list: (): Promise<Meeting[]> => ipcRenderer.invoke('meetings:list'),
    get: (id: string): Promise<Meeting | null> =>
      ipcRenderer.invoke('meetings:get', id),
    create: (title: string): Promise<Meeting> =>
      ipcRenderer.invoke('meetings:create', title),
    rename: (id: string, title: string): Promise<void> =>
      ipcRenderer.invoke('meetings:rename', id, title),
    saveNotes: (id: string, raw: string): Promise<void> =>
      ipcRenderer.invoke('meetings:saveNotes', id, raw),
    end: (id: string): Promise<void> => ipcRenderer.invoke('meetings:end', id),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('meetings:delete', id),
    search: (q: string): Promise<Meeting[]> =>
      ipcRenderer.invoke('meetings:search', q),
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
  keys: {
    has: (name: 'openai' | 'anthropic'): Promise<boolean> =>
      ipcRenderer.invoke('keys:has', name),
    set: (name: 'openai' | 'anthropic', value: string): Promise<void> =>
      ipcRenderer.invoke('keys:set', name, value),
    delete: (name: 'openai' | 'anthropic'): Promise<void> =>
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
};

contextBridge.exposeInMainWorld('quill', quillAPI);

export type QuillAPI = typeof quillAPI;
