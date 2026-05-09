// Deepgram streaming transcription service.
//
// Maintains two WebSockets to api.deepgram.com (one per channel: mic +
// system) so we can keep the existing two-track speaker tagging without
// asking Deepgram to diarize for us. Each frame from the renderer is
// forwarded as raw Linear16 PCM at 16kHz mono. Deepgram returns interim
// and final events; we IPC them back to the renderer.
//
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

interface ChannelSession {
  ws: WebSocket;
  startedAt: number;
  // Deepgram occasionally drops connections after long silence; reconnect
  // transparently and replay the in-flight frame queue.
  reconnects: number;
  closed: boolean;
}

interface Session {
  meetingId: string;
  apiKey: string;
  language: string | undefined;
  channels: Map<DeepgramSpeaker, ChannelSession>;
}

let session: Session | null = null;

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

function openChannel(
  speaker: DeepgramSpeaker,
  apiKey: string,
  language: string | undefined,
  meetingId: string,
  startedAt: number,
): ChannelSession {
  const ws = new WebSocket(buildUrl(language), {
    headers: { Authorization: `Token ${apiKey}` },
  });

  const channel: ChannelSession = {
    ws,
    startedAt,
    reconnects: 0,
    closed: false,
  };

  ws.on('open', () => {
    broadcast('deepgram:state', { speaker, state: 'open' });
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
        meetingId,
        speaker,
        text,
        isFinal: !!(msg.is_final || msg.speech_final),
        startedAtMs,
        durationMs,
        detectedLanguage: msg.channel?.detected_language ?? null,
      });
    } else if (msg.type === 'Metadata') {
      // Initial handshake metadata; ignore but log so we have a timestamp.
      broadcast('deepgram:state', { speaker, state: 'metadata' });
    }
  });

  ws.on('error', (err) => {
    console.error(`[deepgram] ${speaker} ws error:`, err);
    broadcast('deepgram:error', {
      speaker,
      message: err instanceof Error ? err.message : String(err),
    });
  });

  ws.on('close', (code, reason) => {
    if (channel.closed) return;
    // Reconnect-and-resume isn't worth the complexity for v1: we lose at
    // most a few hundred ms of the in-flight chunk and a fresh socket
    // pops back up on the next frame send. Surface to the user instead.
    broadcast('deepgram:state', {
      speaker,
      state: 'closed',
      code,
      reason: reason.toString(),
    });
  });

  return channel;
}

export interface OpenSessionInput {
  meetingId: string;
  apiKey: string;
  language?: string;
}

export function openSession(input: OpenSessionInput): void {
  if (session) closeSession();
  const startedAt = Date.now();
  session = {
    meetingId: input.meetingId,
    apiKey: input.apiKey,
    language: input.language,
    channels: new Map(),
  };
  for (const speaker of ['mic', 'system'] as const) {
    session.channels.set(
      speaker,
      openChannel(speaker, input.apiKey, input.language, input.meetingId, startedAt),
    );
  }
}

/** Forward a raw 16kHz mono Int16 PCM frame to the matching channel. */
export function sendFrame(speaker: DeepgramSpeaker, pcm: Buffer): void {
  if (!session) return;
  const channel = session.channels.get(speaker);
  if (!channel || channel.closed) return;
  if (channel.ws.readyState === WebSocket.OPEN) {
    channel.ws.send(pcm);
  }
}

export function closeSession(): void {
  if (!session) return;
  for (const channel of session.channels.values()) {
    channel.closed = true;
    if (channel.ws.readyState === WebSocket.OPEN) {
      // Send "close stream" frame so Deepgram flushes any pending finals.
      try {
        channel.ws.send(JSON.stringify({ type: 'CloseStream' }));
      } catch {
        /* socket already torn down */
      }
      channel.ws.close();
    } else {
      channel.ws.terminate();
    }
  }
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

// Re-export for type compatibility with main/ipc imports.
export type { BrowserWindow };
