import { useCallback, useRef } from 'react';
import type { Speaker, TranscriptEntry } from '@shared/types.js';

interface QueuedChunk {
  meetingId: string;
  speaker: Speaker;
  blob: Blob;
  startedAtMs: number;
  durationMs: number;
}

export interface UseChunkedTranscriberOptions {
  onEntry: (entry: TranscriptEntry) => void;
  onError?: (err: Error) => void;
  language?: string;
}

const MIN_BYTES = 1500; // skip tiny no-audio chunks

export function useChunkedTranscriber(opts: UseChunkedTranscriberOptions) {
  const queueRef = useRef<QueuedChunk[]>([]);
  const inFlight = useRef(0);
  const onEntryRef = useRef(opts.onEntry);
  const onErrorRef = useRef(opts.onError);
  const languageRef = useRef(opts.language);

  onEntryRef.current = opts.onEntry;
  onErrorRef.current = opts.onError;
  languageRef.current = opts.language;

  const drain = useCallback(async () => {
    while (queueRef.current.length > 0 && inFlight.current < 2) {
      const next = queueRef.current.shift()!;
      inFlight.current++;
      void process(next).finally(() => {
        inFlight.current--;
        if (queueRef.current.length > 0) void drain();
      });
    }
  }, []);

  const process = async (chunk: QueuedChunk) => {
    try {
      if (chunk.blob.size < MIN_BYTES) return;
      const buf = await chunk.blob.arrayBuffer();
      const ext = chunk.blob.type.includes('mp4') ? 'm4a' : 'webm';
      const filename = `chunk-${chunk.speaker}-${chunk.startedAtMs}.${ext}`;
      const text = await window.cairn.whisper.transcribe({
        audio: buf,
        filename,
        model: 'whisper-1',
        language: languageRef.current,
      });
      const trimmed = text.trim();
      if (!trimmed) return;
      const entry = await window.cairn.transcript.append({
        meetingId: chunk.meetingId,
        speaker: chunk.speaker,
        text: trimmed,
        startedAtMs: chunk.startedAtMs,
        durationMs: chunk.durationMs,
      });
      onEntryRef.current(entry);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      onErrorRef.current?.(err);
    }
  };

  const enqueue = useCallback(
    (chunk: QueuedChunk) => {
      queueRef.current.push(chunk);
      void drain();
    },
    [drain],
  );

  return { enqueue };
}
