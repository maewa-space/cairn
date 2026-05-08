export type Speaker = 'system' | 'mic';

export interface TranscriptEntry {
  id: string;
  meetingId: string;
  speaker: Speaker;
  text: string;
  startedAtMs: number;
  durationMs: number;
}

export interface Meeting {
  id: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  rawNotes: string;
  enhancedNotes: string | null;
  templateId: string | null;
  folderId: string | null;
  transcript: TranscriptEntry[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  body: string;
  builtIn: boolean;
  createdAt: string;
}

export interface Settings {
  openaiKey: boolean;
  anthropicKey: boolean;
  micDeviceId: string | null;
  whisperModel: 'whisper-1' | 'gpt-4o-transcribe' | 'gpt-4o-mini-transcribe';
  enhanceModel: string;
}

export interface KeyKind {
  openai: 'openai';
  anthropic: 'anthropic';
}
export type KeyName = keyof KeyKind;

export interface AudioChunk {
  meetingId: string;
  speaker: Speaker;
  startedAtMs: number;
  durationMs: number;
  format: 'webm' | 'wav' | 'mp4';
  bytes: ArrayBuffer;
}

export interface TranscribeResult {
  text: string;
  startedAtMs: number;
  durationMs: number;
  speaker: Speaker;
}

export interface EnhanceRequest {
  meetingId: string;
  templateId: string;
  rawNotes: string;
  transcript: TranscriptEntry[];
}

export interface EnhanceResult {
  markdown: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
}
