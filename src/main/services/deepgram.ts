// Deepgram streaming transcription service.
//
// Maintains two WebSockets to api.deepgram.com (one per channel: mic +
// system) so we can keep the existing two-track speaker tagging without
// asking Deepgram to diarize for us. Each frame from the renderer is
// forwarded as raw Linear16 PCM at 16kHz mono. Deepgram returns interim
// and final events; we IPC them back to the renderer.
//
// On a non-user close (network blip, idle timeout) the channel reconnects
// transparently with exponential backoff and replays the last ~3s of
// buffered PCM so transcription continues without the user touching Stop.
// The renderer chooses streaming vs. batch transcription at meeting start
// based on whether a Deepgram key is set. If you start a meeting without
// a key Quill falls back to chunked Whisper.

import WebSocket from 'ws';
import type { BrowserWindow } from 'electron';
import { BrowserWindow as BW } from 'electron';

const DG_URL =
  'wss://api.deepgram.com/v1/listen' +
  '?model=nova-3' +
  '&encoding=linear16' +
  '&sample_rate=16000' +
  '&channels=1' +
  '&interim_results=true' +
  '&smart_format=true' +
  '&punctuate=true' +
  '&endpointing=300';

export type DeepgramSpeaker = 'mic' | 'system';

// Bounded ring buffer of PCM frames so a reconnect can replay recent audio.
// 96 KB ≈ 3s of 16kHz mono Int16, enough headroom for the worst-case
// reconnect window (4 attempts at 250→500→1000→2000ms = 3.75s total).
const MAX_BUFFER_BYTES = 96 * 1024;

const RECONNECT_DELAYS_MS = [250, 500, 1_000, 2_000] as const;
const MAX_RECONNECTS = RECONNECT_DELAYS_MS.length;

const WS_OPEN = 1;

// Minimal structural type so unit tests can substitute a fake without
// pulling in the full `ws` module.
export interface WsLike {
  readyState: number;
  send(data: Buffer | string): void;
  close(): void;
  terminate(): void;
  on(event: 'open', handler: () => void): void;
  on(event: 'message', handler: (raw: { toString(): string }) => void): void;
  on(event: 'close', handler: (code: number, reason: Buffer) => void): void;
  on(event: 'error', handler: (err: Error) => void): void;
}

export type WsFactory = (
  url: string,
  opts: { headers: Record<string, string> },
) => WsLike;

const defaultWsFactory: WsFactory = (url, opts) =>
  new WebSocket(url, opts) as unknown as WsLike;

let wsFactory: WsFactory = defaultWsFactory;

/** Test seam — swap in a fake WebSocket factory for unit tests. Pass null
 *  to restore the real `ws` module factory. */
export function __setWsFactoryForTesting(factory: WsFactory | null): void {
  wsFactory = factory ?? defaultWsFactory;
}

function broadcast(channel: string, payload?: unknown): void {
  for (const w of BW.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

interface DeepgramAlternative {
  transcript: string;
  confidence?: number;
}

interface DeepgramResultMessage {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  start?: number;
  duration?: number;
  channel?: {
    alternatives?: DeepgramAlternative[];
    detected_language?: string;
  };
}

function buildUrl(language?: string): string {
  if (!language || language === 'auto') return DG_URL;
  return `${DG_URL}&language=${encodeURIComponent(language)}`;
}

class DeepgramChannel {
  private ws: WsLike | null = null;
  private buffer: Buffer[] = [];
  private bufferBytes = 0;
  private closed = false;
  private isReconnect = false;
  private reconnectAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly speaker: DeepgramSpeaker,
    private readonly apiKey: string,
    private readonly language: string | undefined,
    private readonly meetingId: string,
  ) {}

  open(): void {
    if (this.closed) return;
    const ws = wsFactory(buildUrl(this.language), {
      headers: { Authorization: `Token ${this.apiKey}` },
    });
    this.ws = ws;
    const wasReconnect = this.isReconnect;

    ws.on('open', () => {
      if (this.closed) return;
      if (wasReconnect) {
        // Replay buffered frames so transcription resumes from ~3s ago.
        for (const frame of this.buffer) {
          try {
            ws.send(frame);
          } catch {
            /* socket may have flipped during the loop */
          }
        }
        this.isReconnect = false;
        this.reconnectAttempt = 0;
        broadcast('deepgram:state', {
          speaker: this.speaker,
          state: 'reconnected',
        });
      } else {
        broadcast('deepgram:state', { speaker: this.speaker, state: 'open' });
      }
    });

    ws.on('message', (raw) => {
      let msg: DeepgramResultMessage;
      try {
        msg = JSON.parse(raw.toString()) as DeepgramResultMessage;
      } catch {
        return;
      }
      if (msg.type === 'Results' || msg.channel) {
        const text = msg.channel?.alternatives?.[0]?.transcript?.trim() ?? '';
        if (!text) return;
        const startedAtMs = Math.round((msg.start ?? 0) * 1000);
        const durationMs = Math.round((msg.duration ?? 0) * 1000);
        broadcast('deepgram:transcript', {
          meetingId: this.meetingId,
          speaker: this.speaker,
          text,
          isFinal: !!(msg.is_final || msg.speech_final),
          startedAtMs,
          durationMs,
          detectedLanguage: msg.channel?.detected_language ?? null,
        });
      } else if (msg.type === 'Metadata') {
        broadcast('deepgram:state', { speaker: this.speaker, state: 'metadata' });
      }
    });

    ws.on('error', (err) => {
      console.error(`[deepgram] ${this.speaker} ws error:`, err);
      // Suppress transient errors during reconnect cycles — surface only the
      // terminal failure (handled in close handler when budget exhausted).
      if (this.closed || this.reconnectAttempt > 0) return;
      broadcast('deepgram:error', {
        speaker: this.speaker,
        message: err instanceof Error ? err.message : String(err),
      });
    });

    ws.on('close', (code, reason) => {
      if (this.closed) return;
      // Exhausted reconnect budget — surface terminal error.
      if (this.reconnectAttempt >= MAX_RECONNECTS) {
        this.closed = true;
        broadcast('deepgram:state', {
          speaker: this.speaker,
          state: 'closed',
          code,
          reason: reason?.toString?.() ?? '',
        });
        broadcast('deepgram:error', {
          speaker: this.speaker,
          message: `Deepgram disconnected after ${MAX_RECONNECTS} reconnect attempts`,
        });
        return;
      }
      const delay = RECONNECT_DELAYS_MS[this.reconnectAttempt];
      this.reconnectAttempt++;
      this.isReconnect = true;
      broadcast('deepgram:state', {
        speaker: this.speaker,
        state: 'reconnecting',
        attempt: this.reconnectAttempt,
        max: MAX_RECONNECTS,
      });
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (this.closed) return;
        this.open();
      }, delay);
    });
  }

  send(pcm: Buffer): void {
    if (this.closed) return;
    // Always buffer so an in-flight reconnect can resume from the recent past.
    this.buffer.push(pcm);
    this.bufferBytes += pcm.length;
    while (this.bufferBytes > MAX_BUFFER_BYTES && this.buffer.length > 1) {
      const evicted = this.buffer.shift();
      if (evicted) this.bufferBytes -= evicted.length;
    }
    if (this.ws && this.ws.readyState === WS_OPEN) {
      try {
        this.ws.send(pcm);
      } catch {
        /* socket flipped between readyState check and send */
      }
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (!this.ws) return;
    if (this.ws.readyState === WS_OPEN) {
      try {
        // Send "close stream" frame so Deepgram flushes any pending finals.
        this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      } catch {
        /* socket already torn down */
      }
      this.ws.close();
    } else {
      this.ws.terminate();
    }
  }

  /** Test introspection — number of bytes currently retained for replay. */
  __bufferBytesForTesting(): number {
    return this.bufferBytes;
  }
}

interface Session {
  meetingId: string;
  channels: Map<DeepgramSpeaker, DeepgramChannel>;
}

let session: Session | null = null;

export interface OpenSessionInput {
  meetingId: string;
  apiKey: string;
  language?: string;
}

export function openSession(input: OpenSessionInput): void {
  if (session) closeSession();
  session = {
    meetingId: input.meetingId,
    channels: new Map(),
  };
  for (const speaker of ['mic', 'system'] as const) {
    const channel = new DeepgramChannel(
      speaker,
      input.apiKey,
      input.language,
      input.meetingId,
    );
    session.channels.set(speaker, channel);
    channel.open();
  }
}

/** Forward a raw 16kHz mono Int16 PCM frame to the matching channel. */
export function sendFrame(speaker: DeepgramSpeaker, pcm: Buffer): void {
  if (!session) return;
  session.channels.get(speaker)?.send(pcm);
}

export function closeSession(): void {
  if (!session) return;
  for (const channel of session.channels.values()) channel.close();
  session = null;
}

export function isSessionRunning(): boolean {
  return session !== null;
}

/** Test seam — exposed for unit tests of the message parser without needing
 *  a live WebSocket. Same shape as what we forward over IPC. */
export function parseDeepgramMessage(raw: string, speaker: DeepgramSpeaker): {
  text: string;
  isFinal: boolean;
  startedAtMs: number;
  durationMs: number;
  detectedLanguage: string | null;
} | null {
  let msg: DeepgramResultMessage;
  try {
    msg = JSON.parse(raw) as DeepgramResultMessage;
  } catch {
    return null;
  }
  if (msg.type !== 'Results' && !msg.channel) return null;
  const text = msg.channel?.alternatives?.[0]?.transcript?.trim() ?? '';
  if (!text) return null;
  void speaker;
  return {
    text,
    isFinal: !!(msg.is_final || msg.speech_final),
    startedAtMs: Math.round((msg.start ?? 0) * 1000),
    durationMs: Math.round((msg.duration ?? 0) * 1000),
    detectedLanguage: msg.channel?.detected_language ?? null,
  };
}

/** Test seam — construct an isolated channel for unit tests. */
export function __createChannelForTesting(args: {
  speaker: DeepgramSpeaker;
  apiKey: string;
  language?: string;
  meetingId: string;
}): DeepgramChannel {
  return new DeepgramChannel(
    args.speaker,
    args.apiKey,
    args.language,
    args.meetingId,
  );
}

export type { DeepgramChannel };

// Re-export for type compatibility with main/ipc imports.
export type { BrowserWindow };
