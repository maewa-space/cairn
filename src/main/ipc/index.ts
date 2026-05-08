import { ipcMain } from 'electron';
import {
  meetingsRepo,
  transcriptRepo,
  templatesRepo,
} from '../services/db.js';
import { getKey, hasKey, setKey, deleteKey, type KeyName } from '../services/keychain.js';
import { transcribe, type WhisperModel } from '../services/whisper.js';
import { enhance } from '../services/enhancer.js';
import type { TranscriptEntry } from '@shared/types.js';

export function registerIpcHandlers(): void {
  // Meetings
  ipcMain.handle('meetings:list', () => meetingsRepo.list());
  ipcMain.handle('meetings:get', (_e, id: string) => meetingsRepo.get(id));
  ipcMain.handle('meetings:create', (_e, title: string) => meetingsRepo.create(title));
  ipcMain.handle('meetings:rename', (_e, id: string, title: string) => {
    meetingsRepo.rename(id, title);
  });
  ipcMain.handle('meetings:saveNotes', (_e, id: string, raw: string) => {
    meetingsRepo.saveNotes(id, raw);
  });
  ipcMain.handle('meetings:end', (_e, id: string) => meetingsRepo.end(id));
  ipcMain.handle('meetings:delete', (_e, id: string) => meetingsRepo.delete(id));
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
      });
      meetingsRepo.setEnhanced(args.meetingId, result.markdown, args.templateId);
      return result;
    },
  );
}
