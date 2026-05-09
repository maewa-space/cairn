import { useCallback, useRef, useState } from 'react';
import type { Speaker, TranscriptEntry } from '@shared/types.js';
import { isHallucination } from '@shared/hallucination.js';

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

// Whisper rejects very small chunks (< ~3 KB) as "Invalid file format" —
// fragmented MP4 / webm headers without enough audio payload.
const MIN_BYTES = 4000;

export function useChunkedTranscriber(opts: UseChunkedTranscriberOptions) {
  const queueRef = useRef<QueuedChunk[]>([]);
  const inFlightRef = useRef(0);
  const [pending, setPending] = useState(0);
  const onEntryRef = useRef(opts.onEntry);
  const onErrorRef = useRef(opts.onError);
  const languageRef = useRef(opts.language);

  onEntryRef.current = opts.onEntry;
  onErrorRef.current = opts.onError;
  languageRef.current = opts.language;

  const updatePending = () => {
    setPending(inFlightRef.current + queueRef.current.length);
  };

  const drain = useCallback(async () => {
    while (queueRef.current.length > 0 && inFlightRef.current < 2) {
      const next = queueRef.current.shift()!;
      inFlightRef.current++;
      updatePending();
      void process(next).finally(() => {
        inFlightRef.current--;
        updatePending();
        if (queueRef.current.length > 0) void drain();
      });
    }
  }, []);

  const process = async (chunk: QueuedChunk) => {
    try {
      if (chunk.blob.size < MIN_BYTES) {
        console.debug(
          `[transcribe] skipped tiny chunk (${chunk.blob.size}b, type=${chunk.blob.type || 'none'})`,
        );
        return;
      }
      const buf = await chunk.blob.arrayBuffer();
      // Map MediaRecorder mime → file extension Whisper accepts. Default to
      // webm because it's our preferred encoder format and chunks remain
      // valid even when timesliced (cluster-based segmentation).
      const type = chunk.blob.type;
      let ext = 'webm';
      if (type.includes('mp4')) ext = 'mp4';
      else if (type.includes('ogg')) ext = 'ogg';
      else if (type.includes('wav')) ext = 'wav';
      const filename = `chunk-${chunk.speaker}-${chunk.startedAtMs}.${ext}`;
      const text = await window.quill.whisper.transcribe({
        audio: buf,
        filename,
        model: 'whisper-1',
        language: languageRef.current,
      });
      const trimmed = text.trim();
      if (!trimmed) return;
      if (isHallucination(trimmed)) {
        console.debug(`[transcribe] dropped hallucination (${chunk.speaker}):`, trimmed);
        return;
      }
      const entry = await window.quill.transcript.append({
        meetingId: chunk.meetingId,
        speaker: chunk.speaker,
        text: trimmed,
        startedAtMs: chunk.startedAtMs,
        durationMs: chunk.durationMs,
      });
      onEntryRef.current(entry);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.warn(
        `[transcribe] chunk failed (size=${chunk.blob.size}b, type=${chunk.blob.type || 'none'}, speaker=${chunk.speaker}):`,
        err.message,
      );
      onErrorRef.current?.(err);
    }
  };

  const enqueue = useCallback(
    (chunk: QueuedChunk) => {
      queueRef.current.push(chunk);
      updatePending();
      void drain();
    },
    [drain],
  );

  return { enqueue, pending };
}
