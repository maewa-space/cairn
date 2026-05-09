// System-audio capture via the AudioTee Swift binary (Core Audio Taps).
//
// Bypasses ScreenCaptureKit and the broken `getDisplayMedia` path on
// macOS Tahoe entirely. The binary streams 16-bit PCM to stdout; we
// accumulate it in main and wrap each `chunkSeconds` window as a WAV
// file, then push it to the renderer over IPC for the existing chunked
// Whisper transcription pipeline.

import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { AudioTee as AudioTeeType } from 'audiotee';

type AudioTeeCtor = typeof AudioTeeType;
let AudioTeeCached: AudioTeeCtor | null = null;
async function loadAudioTee(): Promise<AudioTeeCtor> {
  if (AudioTeeCached) return AudioTeeCached;
  // audiotee is pure-ESM ("type": "module"); main bundle is also ESM but
  // electron-vite's CJS interop ends up calling require() at runtime, which
  // fails with ERR_REQUIRE_ESM. Dynamic import() works in both worlds.
  const mod = await import('audiotee');
  AudioTeeCached = mod.AudioTee;
  return AudioTeeCached;
}

const SAMPLE_RATE = 16_000;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

let tap: AudioTeeType | null = null;
let buffer: Buffer[] = [];
let bufferStartedAtMs: number = 0;
let captureStartedAt: number = 0;
let chunkSeconds = 10;
let flushTimer: NodeJS.Timeout | null = null;
// Permission-denied detection: the renderer only needs to be warned when
// every chunk is silent FROM THE START of capture — that's the signature of
// missing System Audio Recording permission. Mid-capture silence is just
// "no audio is playing right now" and should not surface a warning.
let consecutiveSilentChunks = 0;
let silentWarningSent = false;
const SILENT_CHUNKS_TO_WARN = 3; // ~30s with default chunkSeconds=10

function binaryPath(): string {
  // Packaged: /Applications/Quill.app/Contents/Resources/audiotee
  // Dev:      <repo>/node_modules/audiotee/bin/audiotee
  if (app.isPackaged) {
    return join(process.resourcesPath, 'audiotee');
  }
  return join(
    app.getAppPath(),
    'node_modules',
    'audiotee',
    'bin',
    'audiotee',
  );
}

function pcmToWav(pcm: Buffer): Buffer {
  const dataSize = pcm.length;
  const byteRate = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE;
  const blockAlign = CHANNELS * BYTES_PER_SAMPLE;

  const header = Buffer.alloc(44);
  // RIFF chunk
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4); // ChunkSize
  header.write('WAVE', 8);
  // fmt subchunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  // data subchunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

function rms16(pcm: Buffer): number {
  if (pcm.length < 2) return 0;
  let sumSq = 0;
  const sampleCount = Math.floor(pcm.length / 2);
  for (let i = 0; i < pcm.length - 1; i += 2) {
    const sample = pcm.readInt16LE(i);
    const norm = sample / 32768;
    sumSq += norm * norm;
  }
  return Math.sqrt(sumSq / sampleCount);
}

// Whisper hallucinates ("Thanks for watching!", emoji strings, etc.) when
// fed near-silent audio. Only forward chunks above this RMS threshold.
const SILENCE_RMS_THRESHOLD = 0.005;

function flush(): void {
  if (buffer.length === 0) return;
  const pcm = Buffer.concat(buffer);
  buffer = [];
  const now = performance.now();
  const startedAtMs = bufferStartedAtMs;
  const durationMs = Math.round(now - captureStartedAt) - startedAtMs;
  bufferStartedAtMs = Math.round(now - captureStartedAt);

  // Skip tiny chunks (no real signal yet).
  const minBytes = 0.5 * SAMPLE_RATE * BYTES_PER_SAMPLE; // 0.5s
  if (pcm.length < minBytes) return;

  // Skip silent chunks — happens when System Audio Recording permission
  // wasn't granted (Whisper would hallucinate) AND when nothing is playing.
  // We only warn the renderer if the first N chunks are ALL silent, which
  // is the signature of a permission problem; mid-capture quiet just means
  // there's no audio to capture right now.
  const amplitude = rms16(pcm);
  if (amplitude < SILENCE_RMS_THRESHOLD) {
    consecutiveSilentChunks += 1;
    if (!silentWarningSent && consecutiveSilentChunks >= SILENT_CHUNKS_TO_WARN) {
      silentWarningSent = true;
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('audio-tap:silent', { amplitude });
      }
    }
    return;
  }
  consecutiveSilentChunks = 0;

  const wav = pcmToWav(pcm);
  // Send to all open windows. The renderer-side hook listens for this
  // event and forwards the chunk into the existing Whisper queue.
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('audio-tap:chunk', {
      wav: wav.buffer.slice(
        wav.byteOffset,
        wav.byteOffset + wav.byteLength,
      ),
      startedAtMs,
      durationMs,
    });
  }
}

export async function startAudioTap(seconds = 10): Promise<void> {
  if (tap) return; // already running
  chunkSeconds = seconds;
  buffer = [];
  captureStartedAt = performance.now();
  bufferStartedAtMs = 0;
  consecutiveSilentChunks = 0;
  silentWarningSent = false;

  const AudioTee = await loadAudioTee();
  tap = new AudioTee({
    sampleRate: SAMPLE_RATE,
    binaryPath: binaryPath(),
  });

  tap.on('data', (chunk) => {
    buffer.push(chunk.data);
    // Push a 0-1 amplitude reading for the renderer level meter, throttled
    // by chunkDurationMs (default 200ms in audiotee). Cheap RMS over the
    // buffer slice avoids needing a WebAudio analyser in the renderer.
    const amp = rms16(chunk.data);
    // Boost to map typical spoken/music RMS (~0.02-0.15) to a useful 0-1 range.
    const level = Math.min(1, amp * 6);
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('audio-tap:level', { level });
    }
  });
  tap.on('error', (err) => {
    console.error('[audio-tap] error:', err);
  });
  tap.on('log', (_level, msg) => {
    console.log('[audio-tap]', msg.message);
  });

  await tap.start();

  flushTimer = setInterval(flush, chunkSeconds * 1000);
}

export async function stopAudioTap(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flush(); // emit any remaining buffered audio
  if (tap) {
    try {
      await tap.stop();
    } catch (e) {
      console.warn('[audio-tap] stop error:', e);
    }
    tap = null;
  }
  buffer = [];
}

export function isAudioTapRunning(): boolean {
  return tap !== null;
}
