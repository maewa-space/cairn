import { useCallback, useEffect, useRef, useState } from 'react';
import type { Speaker } from '@shared/types.js';

export interface ChunkPayload {
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
  micError: string | null;
  systemError: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  retrySystem: () => Promise<void>;
  hasMic: boolean;
  hasSystem: boolean;
  /** Always false in the batch (Whisper) pipeline — surfaces only in
   *  streaming (Deepgram) mode but kept on the shared shape so meeting.tsx
   *  doesn't have to fork its UI between pipelines. */
  reconnecting: boolean;
}

interface StreamRecorder {
  stream: MediaStream;
  recorder: MediaRecorder;
  speaker: Speaker;
  startedAt: number;
  bufferStart: number;
  rollTimer: number | null;
  // Mutable so the rolling restart loop can swap recorders in place.
  alive: boolean;
  // Running raw-RMS sum + count for the current chunk window. Used to gate
  // silent input before sending it to Whisper (which hallucinates on silence).
  rmsSum: number;
  rmsSamples: number;
}

const CHUNK_SECONDS_DEFAULT = 10;
// Mean raw RMS below this means the mic chunk is effectively silent. Whisper
// turns silent audio into "Thanks for watching", emoji strings, or random
// non-English phrases — drop the chunk before it ever leaves the renderer.
// Calibrated against the Mac built-in mic with AGC OFF: ambient room noise
// (HVAC + breathing) sits around 0.003-0.008, quiet speech around 0.02+.
const MIC_SILENCE_RMS_THRESHOLD = 0.01;

export function useAudioCapture(opts: UseAudioCaptureOptions): UseAudioCaptureReturn {
  const [state, setState] = useState<UseAudioCaptureReturn['state']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [hasMic, setHasMic] = useState(false);
  const [hasSystem, setHasSystem] = useState(false);

  const recordersRef = useRef<StreamRecorder[]>([]);
  const audioTapUnsubRef = useRef<(() => void) | null>(null);
  const latestMicLevelRef = useRef(0);
  const latestSysLevelRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sysAnalyserRef = useRef<AnalyserNode | null>(null);
  const startedAtRef = useRef<number>(0);
  const chunkMsRef = useRef<number>(CHUNK_SECONDS_DEFAULT * 1000);
  const levelTimerRef = useRef<number | null>(null);
  const onChunkRef = useRef(opts.onChunk);
  const onLevelRef = useRef(opts.onLevel);

  useEffect(() => {
    onChunkRef.current = opts.onChunk;
    onLevelRef.current = opts.onLevel;
  });

  const stop = useCallback(async () => {
    setState('stopping');
    if (audioTapUnsubRef.current) {
      audioTapUnsubRef.current();
      audioTapUnsubRef.current = null;
    }
    try {
      await window.quill.audioTap.stop();
    } catch (e) {
      console.warn('[audio] audio-tap stop error:', e);
    }
    for (const r of recordersRef.current) {
      try {
        r.alive = false;
        if (r.rollTimer != null) {
          window.clearTimeout(r.rollTimer);
          r.rollTimer = null;
        }
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
      } catch (e) {
        // Already closed or in a transitional state — log so a runaway
        // leak shows up in DevTools rather than vanishing.
        console.warn('[audio] AudioContext close failed:', e);
      }
      audioCtxRef.current = null;
    }
    setHasMic(false);
    setHasSystem(false);
    setState('idle');
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setMicError(null);
    setSystemError(null);
    setState('starting');

    const chunkMs = (opts.chunkSeconds ?? CHUNK_SECONDS_DEFAULT) * 1000;
    chunkMsRef.current = chunkMs;
    const startedAt = performance.now();
    startedAtRef.current = startedAt;

    const recorders: StreamRecorder[] = [];
    let micStreamForAnalyser: MediaStream | null = null;
    let sysStreamForAnalyser: MediaStream | null = null;

    try {
      try {
        // Ask macOS for mic permission via Electron's systemPreferences API.
        const status = await window.quill.permissions.status();
        if (status.microphone === 'denied' || status.microphone === 'restricted') {
          throw new Error(
            'Microphone permission was denied. Open System Settings → Privacy & Security → Microphone, enable Quill, then quit and reopen the app.',
          );
        }
        if (status.microphone === 'not-determined') {
          const granted = await window.quill.permissions.askMicrophone();
          if (!granted) {
            throw new Error('Microphone permission was not granted.');
          }
        }

        // Flush Chromium's audio device cache by listing devices first.
        // On macOS Tahoe, getUserMedia after a fresh permission grant
        // sometimes returns NotFoundError because the device cache wasn't
        // refreshed when TCC was updated. enumerateDevices() forces a refresh.
        let inputDevices: MediaDeviceInfo[] = [];
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          inputDevices = devices.filter((d) => d.kind === 'audioinput');
          console.log(
            `[audio] enumerated ${inputDevices.length} audio input device(s)`,
            inputDevices.map((d) => ({ id: d.deviceId, label: d.label })),
          );
        } catch (enumErr) {
          console.warn('[audio] enumerateDevices failed:', enumErr);
        }
        if (inputDevices.length === 0) {
          throw new Error(
            'No audio input devices found by Chromium. Try: System Settings → Sound → Input — make sure a mic is selected. Then quit and reopen Quill.',
          );
        }

        // Try the first enumerated input device explicitly. Falls back to
        // unconstrained `audio: true` if that fails.
        const preferredId = inputDevices[0].deviceId;
        let micStream: MediaStream;
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: preferredId ? { exact: preferredId } : undefined,
              echoCancellation: true,
              noiseSuppression: true,
              // AGC pumps up ambient noise on silent input so the analyser
              // never sees true silence — that lets Whisper hallucinate on
              // boosted hum. Keep it off; speech still records fine because
              // OpenAI's Whisper handles low-volume speech well.
              autoGainControl: false,
            },
          });
        } catch (constrainedErr) {
          console.warn(
            '[audio] mic constrained getUserMedia failed, retrying bare:',
            constrainedErr,
          );
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        recorders.push(buildRecorder(micStream, 'mic', startedAt, chunkMs));
        micStreamForAnalyser = micStream;
        setHasMic(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[audio] mic unavailable:', msg);
        setMicError(msg);
      }

      try {
        // System audio is captured by the AudioTee Swift binary spawned in
        // the main process (Core Audio Tap). PCM chunks are wrapped to WAV
        // server-side and pushed to the renderer over IPC. We subscribe to
        // those chunks here and feed them to the existing Whisper queue
        // tagged as 'system' speaker.
        const unsubChunk = window.quill.audioTap.onChunk((payload) => {
          const blob = new Blob([payload.wav], { type: 'audio/wav' });
          onChunkRef.current({
            speaker: 'system',
            blob,
            startedAtMs: payload.startedAtMs,
            durationMs: payload.durationMs,
          });
        });
        // If the binary streams pure silence, the audio-tap service emits
        // a 'silent' event instead of forwarding the chunk. That means
        // System Audio Recording permission almost certainly isn't granted.
        const unsubSilent = window.quill.audioTap.onSilent(() => {
          setSystemError(
            'System audio is silent. Open Settings → Privacy & Security → Screen & System Audio Recording, scroll to the "System Audio Recording Only" section, click + and add Quill. Then quit and reopen Quill.',
          );
        });
        // Drive the System level meter from the PCM amplitude reading the
        // main process emits per AudioTee chunk (every ~200ms).
        const unsubLevel = window.quill.audioTap.onLevel(({ level }) => {
          latestSysLevelRef.current = level;
          onLevelRef.current?.(latestMicLevelRef.current, level);
        });
        audioTapUnsubRef.current = () => {
          unsubChunk();
          unsubSilent();
          unsubLevel();
        };
        await window.quill.audioTap.start(opts.chunkSeconds ?? CHUNK_SECONDS_DEFAULT);
        setHasSystem(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[audio] system audio unavailable:', msg);
        setSystemError(msg);
      }

      if (recorders.length === 0) {
        throw new Error(
          'No audio sources available. Allow microphone or screen-recording permission.',
        );
      }

      // Now that at least one stream succeeded, create the AudioContext for
      // analysers. AudioContext creation can fail on some macOS audio routing
      // configurations; we don't want that failure to block stream capture.
      let micAnalyser: AnalyserNode | null = null;
      let sysAnalyser: AnalyserNode | null = null;
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        micAnalyser = ctx.createAnalyser();
        sysAnalyser = ctx.createAnalyser();
        sysAnalyserRef.current = sysAnalyser;
        micAnalyser.fftSize = 256;
        sysAnalyser.fftSize = 256;
        if (micStreamForAnalyser) {
          ctx.createMediaStreamSource(micStreamForAnalyser).connect(micAnalyser);
        }
        if (sysStreamForAnalyser) {
          ctx.createMediaStreamSource(sysStreamForAnalyser).connect(sysAnalyser);
        }
      } catch (analyserErr) {
        console.warn(
          '[audio] AudioContext setup failed (level meters will be disabled):',
          analyserErr,
        );
      }

      recordersRef.current = recorders;

      // Rolling-recorder pattern: each recorder runs for `chunkMs`, then we
      // stop+restart it so each emitted blob is a STANDALONE webm file
      // (with EBML header + clusters, parseable by Whisper). MediaRecorder's
      // `start(timeslice)` API only gives the header on the first chunk and
      // fragmented data afterwards — Whisper rejects those.
      for (const r of recorders) {
        attachRollingRecorder(r, startedAt, chunkMs, onChunkRef);
      }

      // Level meter — drive mic from the WebAudio analyser; system level
      // is updated externally by the AudioTee onLevel IPC handler.
      // We also accumulate raw (unscaled) RMS samples into the mic recorder
      // so the chunk handler can decide whether the window was silent.
      if (micAnalyser) {
        const micArr = new Uint8Array(micAnalyser.frequencyBinCount);
        const micRecorder = recorders.find((r) => r.speaker === 'mic');
        levelTimerRef.current = window.setInterval(() => {
          micAnalyser.getByteTimeDomainData(micArr);
          const raw = rmsRaw(micArr);
          if (micRecorder) {
            micRecorder.rmsSum += raw;
            micRecorder.rmsSamples += 1;
          }
          const micLvl = Math.min(1, raw * 2.2);
          latestMicLevelRef.current = micLvl;
          onLevelRef.current?.(micLvl, latestSysLevelRef.current);
        }, 80);
      }

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

  const retrySystem = useCallback(async () => {
    if (state !== 'recording') return;
    setSystemError(null);
    try {
      // Subscribe (idempotent — main only spawns one binary at a time).
      if (!audioTapUnsubRef.current) {
        audioTapUnsubRef.current = window.quill.audioTap.onChunk((payload) => {
          const blob = new Blob([payload.wav], { type: 'audio/wav' });
          onChunkRef.current({
            speaker: 'system',
            blob,
            startedAtMs: payload.startedAtMs,
            durationMs: payload.durationMs,
          });
        });
      }
      await window.quill.audioTap.start(chunkMsRef.current / 1000);
      setHasSystem(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSystemError(msg);
    }
  }, [state]);

  useEffect(() => () => void stop(), [stop]);

  return {
    state,
    error,
    micError,
    systemError,
    start,
    stop,
    retrySystem,
    hasMic,
    hasSystem,
    reconnecting: false,
  };
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
    rollTimer: null,
    alive: true,
    rmsSum: 0,
    rmsSamples: 0,
  };
}

/**
 * Drive a stream-recorder by stopping + restarting MediaRecorder every
 * `chunkMs` ms. Each `stop()` flushes a complete, standalone webm file via
 * the `ondataavailable` event (Whisper-friendly), then we immediately
 * spin up a fresh MediaRecorder on the same stream. The brief swap gap
 * (~10-30ms) is below typical word boundaries so transcription is unaffected.
 */
function attachRollingRecorder(
  r: StreamRecorder,
  startedAt: number,
  chunkMs: number,
  onChunkRef: { current: (c: ChunkPayload) => void },
): void {
  const wireRecorder = (rec: MediaRecorder) => {
    rec.ondataavailable = (ev) => {
      if (!ev.data || ev.data.size === 0) return;
      const now = performance.now();
      const startedAtMs = Math.round(r.bufferStart - startedAt);
      const durationMs = Math.max(0, Math.round(now - r.bufferStart));
      r.bufferStart = now;
      // Mic-side silence gate: if the average raw RMS over the chunk window
      // was below threshold the chunk is silent and Whisper would hallucinate
      // ("Thanks for watching", emojis, random Swedish/Spanish/Russian).
      // Drop it instead. System-side has its own gate in audio-tap.ts.
      if (r.speaker === 'mic' && r.rmsSamples > 0) {
        const meanRms = r.rmsSum / r.rmsSamples;
        r.rmsSum = 0;
        r.rmsSamples = 0;
        if (meanRms < MIC_SILENCE_RMS_THRESHOLD) {
          console.log(
            `[audio] mic chunk DROPPED silent (rms=${meanRms.toFixed(4)} < ${MIC_SILENCE_RMS_THRESHOLD}, size=${ev.data.size}b)`,
          );
          return;
        }
        // Quiet pass log — visible only with DevTools "Verbose" level enabled.
        console.debug(
          `[audio] mic chunk passed (rms=${meanRms.toFixed(4)}, size=${ev.data.size}b)`,
        );
      }
      onChunkRef.current({
        speaker: r.speaker,
        blob: ev.data,
        startedAtMs,
        durationMs,
      });
    };
    rec.onstop = () => {
      if (!r.alive) return;
      // Spin up the next recorder immediately on the same stream.
      const mime = pickMime();
      const next = new MediaRecorder(rec.stream, mime ? { mimeType: mime } : undefined);
      r.recorder = next;
      wireRecorder(next);
      try {
        next.start();
      } catch (e) {
        // Stream was revoked or device disappeared — mark this recorder
        // dead so the parent state machine can surface the failure
        // instead of looking "recording" with no audio coming through.
        console.error('[audio] recorder restart failed — stopping rolling loop:', e);
        r.alive = false;
        return;
      }
      r.rollTimer = window.setTimeout(() => {
        if (r.alive && r.recorder.state === 'recording') {
          try {
            r.recorder.stop();
          } catch (e) {
            console.warn('[audio] recorder.stop in roll timer failed:', e);
          }
        }
      }, chunkMs);
    };
  };

  wireRecorder(r.recorder);
  r.recorder.start();
  r.rollTimer = window.setTimeout(() => {
    if (r.alive && r.recorder.state === 'recording') {
      try {
        r.recorder.stop();
      } catch (e) {
        console.warn('[audio] initial recorder.stop failed:', e);
      }
    }
  }, chunkMs);
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

/**
 * Raw RMS of a time-domain Uint8Array from an AnalyserNode (range 0-128).
 * Returns the unscaled RMS so the silence gate can compare against a fixed
 * threshold; the level meter applies its own 2.2x compression for display.
 */
function rmsRaw(arr: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = (arr[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / arr.length);
}
