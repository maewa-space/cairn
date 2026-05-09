import { describe, it, expect } from 'vitest';
import {
  TRANSCRIPT_LANGUAGES,
  languageToStored,
  storedToLanguage,
} from '../../src/shared/transcript-language.js';

describe('transcript language helpers', () => {
  it('round-trips a concrete locale through stored form', () => {
    expect(languageToStored('de')).toBe('de');
    expect(storedToLanguage('de')).toBe('de');
  });

  it('encodes auto-detect as "auto" in storage', () => {
    expect(languageToStored(null)).toBe('auto');
  });

  it('decodes "auto" / null / empty back to undefined for the API call', () => {
    expect(storedToLanguage('auto')).toBeUndefined();
    expect(storedToLanguage(null)).toBeUndefined();
    expect(storedToLanguage('')).toBeUndefined();
  });

  it('exposes Auto as the first option (default)', () => {
    expect(TRANSCRIPT_LANGUAGES[0]).toEqual({ label: 'Auto-detect', code: null });
  });

  it('lists 14 concrete locales plus Auto', () => {
    const concrete = TRANSCRIPT_LANGUAGES.filter((o) => o.code !== null);
    expect(concrete.length).toBeGreaterThanOrEqual(14);
    // No duplicate codes.
    const codes = concrete.map((o) => o.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('uses two-letter ISO-639-1 codes (compatible with Whisper + Deepgram Nova-3)', () => {
    const concrete = TRANSCRIPT_LANGUAGES.filter((o) => o.code !== null);
    for (const opt of concrete) {
      expect(opt.code).toMatch(/^[a-z]{2}$/);
    }
  });
});
