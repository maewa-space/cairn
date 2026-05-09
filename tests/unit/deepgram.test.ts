import { describe, it, expect } from 'vitest';
import { parseDeepgramMessage } from '../../src/main/services/deepgram.js';

describe('parseDeepgramMessage', () => {
  it('extracts text + timing from a Results message', () => {
    const raw = JSON.stringify({
      type: 'Results',
      is_final: true,
      start: 12.34,
      duration: 1.5,
      channel: {
        alternatives: [{ transcript: 'Hello there', confidence: 0.98 }],
      },
    });
    const parsed = parseDeepgramMessage(raw, 'mic');
    expect(parsed).not.toBeNull();
    expect(parsed!.text).toBe('Hello there');
    expect(parsed!.isFinal).toBe(true);
    expect(parsed!.startedAtMs).toBe(12340);
    expect(parsed!.durationMs).toBe(1500);
  });

  it('marks speech_final as final too', () => {
    const raw = JSON.stringify({
      channel: {
        alternatives: [{ transcript: 'last word' }],
      },
      speech_final: true,
    });
    const parsed = parseDeepgramMessage(raw, 'system');
    expect(parsed!.isFinal).toBe(true);
  });

  it('returns null for empty transcripts', () => {
    const raw = JSON.stringify({
      type: 'Results',
      channel: { alternatives: [{ transcript: '   ' }] },
    });
    expect(parseDeepgramMessage(raw, 'mic')).toBeNull();
  });

  it('returns null for non-Results messages', () => {
    const raw = JSON.stringify({ type: 'Metadata', request_id: 'abc' });
    expect(parseDeepgramMessage(raw, 'mic')).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(parseDeepgramMessage('not-json', 'mic')).toBeNull();
  });

  it('captures detected language when present', () => {
    const raw = JSON.stringify({
      type: 'Results',
      is_final: true,
      channel: {
        alternatives: [{ transcript: 'Guten Tag' }],
        detected_language: 'de',
      },
    });
    const parsed = parseDeepgramMessage(raw, 'mic');
    expect(parsed!.detectedLanguage).toBe('de');
  });
});
