import { useCallback, useEffect, useRef, useState } from 'react';
import type { Speaker } from '@shared/types.js';

interface ChunkPayload {
  speaker: Speaker;
  blob: Blob;
  startedAtMs: number;
  durationMs: number;
}

export interface UseAudioCaptureOptions {
  chunkSeconds?: number;
  onChunk: (chunk: ChunkPayload) => void;
  onLevel?: (mic: number, system: number) => void;
}

export interface UseAudioCaptureReturn {
  state: 'idle' | 'starting' | 'recording' | 'stopping' | 'error';
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  hasMic: boolean;
  hasSystem: boolean;
}

interface StreamRecorder {
  stream: MediaStream;
  recorder: MediaRecorder;
  speaker: Speaker;
  startedAt: number;
  bufferStart: number;
}

const CHUNK_SECONDS_DEFAULT = 20;

export function useAudioCapture(opts: UseAudioCaptureOptions): UseAudioCaptureReturn {
  const [state, setState] = useState<UseAudioCaptureReturn['state']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasMic, setHasMic] = useState(false);
  const [hasSystem, setHasSystem] = useState(false);

  const recordersRef = useRef<StreamRecorder[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelTimerRef = useRef<number | null>(null);
  const onChunkRef = useRef(opts.onChunk);
  const onLevelRef = useRef(opts.onLevel);

  useEffect(() => {
    onChunkRef.current = opts.onChunk;
    onLevelRef.current = opts.onLevel;
  });

  const stop = useCallback(async () => {
    setState('stopping');
    for (const r of recordersRef.current) {
      try {
        if (r.recorder.state !== 'inactive') r.recorder.stop();
        r.stream.getTracks().forEach((t) => t.stop());
      } catch (e) {
        console.error('[audio] stop error', e);
      }
    }
    recordersRef.current = [];
    if (levelTimerRef.current) {
      window.clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        await audioCtxRef.current.close();
      } catch {
        // ignore
      }
      audioCtxRef.current = null;
    }
    setHasMic(false);
    setHasSystem(false);
    setState('idle');
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setState('starting');

    const chunkMs = (opts.chunkSeconds ?? CHUNK_SECONDS_DEFAULT) * 1000;
    const startedAt = performance.now();

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const micAnalyser = ctx.createAnalyser();
    const sysAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 256;
    sysAnalyser.fftSize = 256;

    const recorders: StreamRecorder[] = [];

    try {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        recorders.push(buildRecorder(micStream, 'mic', startedAt, chunkMs));
        ctx.createMediaStreamSource(micStream).connect(micAnalyser);
        setHasMic(true);
      } catch (e) {
        console.warn('[audio] mic unavailable:', e);
      }

      try {
        const sysStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          // @ts-expect-error — non-standard but Chromium supports it
          systemAudio: 'include',
        });
        const audioTracks = sysStream.getAudioTracks();
        sysStream.getVideoTracks().forEach((t) => t.stop());
        if (audioTracks.length === 0) {
          throw new Error('No system audio track returned.');
        }
        const audioOnly = new MediaStream(audioTracks);
        recorders.push(buildRecorder(audioOnly, 'system', startedAt, chunkMs));
        ctx.createMediaStreamSource(audioOnly).connect(sysAnalyser);
        setHasSystem(true);
      } catch (e) {
        console.warn('[audio] system audio unavailable:', e);
      }

      if (recorders.length === 0) {
        throw new Error(
          'No audio sources available. Allow microphone or screen-recording permission.',
        );
      }

      recordersRef.current = recorders;

      // Start each recorder with the chunk timeslice — emits chunks every Ns.
      for (const r of recorders) {
        r.recorder.ondataavailable = async (ev) => {
          if (!ev.data || ev.data.size === 0) return;
          const now = performance.now();
          const startedAtMs = Math.round(r.bufferStart - startedAt);
          const durationMs = Math.max(0, Math.round(now - r.bufferStart));
          r.bufferStart = now;
          onChunkRef.current({
            speaker: r.speaker,
            blob: ev.data,
            startedAtMs,
            durationMs,
          });
        };
        r.recorder.start(chunkMs);
      }

      // Level meter
      const micArr = new Uint8Array(micAnalyser.frequencyBinCount);
      const sysArr = new Uint8Array(sysAnalyser.frequencyBinCount);
      levelTimerRef.current = window.setInterval(() => {
        micAnalyser.getByteTimeDomainData(micArr);
        sysAnalyser.getByteTimeDomainData(sysArr);
        const micLvl = rms(micArr);
        const sysLvl = rms(sysArr);
        onLevelRef.current?.(micLvl, sysLvl);
      }, 80);

      setState('recording');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setState('error');
      // Clean up partial setup
      for (const r of recorders) r.stream.getTracks().forEach((t) => t.stop());
      recordersRef.current = [];
    }
  }, [opts.chunkSeconds]);

  useEffect(() => () => void stop(), [stop]);

  return { state, error, start, stop, hasMic, hasSystem };
}

function buildRecorder(
  stream: MediaStream,
  speaker: Speaker,
  startedAt: number,
  _chunkMs: number,
): StreamRecorder {
  const mime = pickMime();
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  return {
    stream,
    recorder,
    speaker,
    startedAt,
    bufferStart: performance.now(),
  };
}

function pickMime(): string | undefined {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return undefined;
}

function rms(arr: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = (arr[i] - 128) / 128;
    sum += v * v;
  }
  const r = Math.sqrt(sum / arr.length);
  // Map roughly 0..1 with soft compression
  return Math.min(1, r * 2.2);
}
