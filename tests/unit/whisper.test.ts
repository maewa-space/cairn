import { describe, it, expect, vi } from 'vitest';
import { transcribe, mimeFor, WhisperError } from '../../src/main/services/whisper.js';

describe('whisper.mimeFor', () => {
  it('maps known extensions to mime types', () => {
    expect(mimeFor('clip.m4a')).toBe('audio/m4a');
    expect(mimeFor('clip.mp3')).toBe('audio/mpeg');
    expect(mimeFor('clip.wav')).toBe('audio/wav');
    expect(mimeFor('clip.webm')).toBe('audio/webm');
    expect(mimeFor('clip.flac')).toBe('audio/flac');
    expect(mimeFor('clip.unknown')).toBe('audio/webm');
  });
});

describe('whisper.transcribe', () => {
  const sampleBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);

  it('builds a multipart request with required fields', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body as FormData;
      expect(body.get('model')).toBe('whisper-1');
      expect(body.get('response_format')).toBe('json');
      expect(body.get('file')).toBeInstanceOf(Blob);
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        'Bearer test-key',
      );
      return new Response(JSON.stringify({ text: '  Hello world.  ' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const text = await transcribe({
      audio: sampleBytes,
      filename: 'a.wav',
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(text).toBe('Hello world.');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('forwards optional language and prompt fields', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body as FormData;
      expect(body.get('language')).toBe('de');
      expect(body.get('prompt')).toBe('Stand-up meeting');
      return new Response(JSON.stringify({ text: 'ok' }), { status: 200 });
    });
    await transcribe({
      audio: sampleBytes,
      filename: 'a.wav',
      apiKey: 'k',
      language: 'de',
      prompt: 'Stand-up meeting',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
  });

  it('rejects audio over 25MB', async () => {
    const big = new Uint8Array(26 * 1024 * 1024);
    await expect(
      transcribe({ audio: big, filename: 'big.wav', apiKey: 'k' }),
    ).rejects.toBeInstanceOf(WhisperError);
  });

  it('throws WhisperError with API message on non-200', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'invalid key' } }), {
        status: 401,
      }),
    );
    await expect(
      transcribe({
        audio: sampleBytes,
        filename: 'a.wav',
        apiKey: 'bad',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ message: 'invalid key', status: 401 });
  });
});
