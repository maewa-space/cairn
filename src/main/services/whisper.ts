// Ports WhisperService.swift to TypeScript.
// Multipart POST to /v1/audio/transcriptions, 25 MB cap, OpenAI error envelope.

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const MAX_BYTES = 25 * 1024 * 1024;

export type WhisperModel =
  | 'whisper-1'
  | 'gpt-4o-transcribe'
  | 'gpt-4o-mini-transcribe';

export interface TranscribeOptions {
  audio: ArrayBuffer | Uint8Array | Buffer;
  filename: string;
  apiKey: string;
  model?: WhisperModel;
  language?: string;
  prompt?: string;
  fetchImpl?: typeof fetch;
}

export interface TranscriptionApiError {
  error: { message: string; type?: string; code?: string };
}

export class WhisperError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'WhisperError';
  }
}

export async function transcribe(opts: TranscribeOptions): Promise<string> {
  const {
    audio,
    filename,
    apiKey,
    model = 'whisper-1',
    language,
    prompt,
    fetchImpl = fetch,
  } = opts;

  const bytes: Uint8Array =
    audio instanceof ArrayBuffer
      ? new Uint8Array(audio)
      : audio instanceof Uint8Array
        ? audio
        : new Uint8Array(audio);

  if (bytes.byteLength > MAX_BYTES) {
    throw new WhisperError(
      `Audio file too large (${bytes.byteLength} bytes). Maximum is ${MAX_BYTES} bytes.`,
    );
  }

  // Copy into a fresh ArrayBuffer-backed view so the Blob types are unambiguous.
  const blobView = new Uint8Array(bytes);
  const form = new FormData();
  form.append('model', model);
  if (language) form.append('language', language);
  if (prompt) form.append('prompt', prompt);
  form.append('response_format', 'json');
  form.append(
    'file',
    new Blob([blobView], { type: mimeFor(filename) }),
    filename,
  );

  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    let message = `Whisper API status ${res.status}`;
    try {
      const data = (await res.json()) as TranscriptionApiError;
      if (data?.error?.message) message = data.error.message;
    } catch {
      // ignore parse error, use default message
    }
    throw new WhisperError(message, res.status);
  }

  const data = (await res.json()) as { text?: string };
  return (data.text ?? '').trim();
}

export function mimeFor(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'm4a':
      return 'audio/m4a';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'webm':
      return 'audio/webm';
    case 'mp4':
      return 'audio/mp4';
    case 'ogg':
      return 'audio/ogg';
    case 'flac':
      return 'audio/flac';
    default:
      return 'audio/webm';
  }
}
