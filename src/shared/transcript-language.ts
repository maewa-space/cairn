// Supported transcription languages. Both Whisper (REST `language` param,
// ISO-639-1) and Deepgram Nova-3 (`language` query param, BCP-47 with a few
// exceptions) accept the same two-letter codes for these languages, so we
// can pass through the same string into both pipelines.
//
// `Auto` resolves to `undefined` at the call site — Whisper auto-detects
// when the param is omitted; Deepgram Nova-3 auto-detects when neither
// `language` nor `detect_language` is specified.

export interface TranscriptLanguageOption {
  /** Display label rendered in the Settings select. */
  label: string;
  /** ISO-639-1 / BCP-47 code passed to the transcription APIs. `null` = auto-detect. */
  code: string | null;
}

export const TRANSCRIPT_LANGUAGES: ReadonlyArray<TranscriptLanguageOption> = [
  { label: 'Auto-detect', code: null },
  { label: 'English', code: 'en' },
  { label: 'German', code: 'de' },
  { label: 'Spanish', code: 'es' },
  { label: 'French', code: 'fr' },
  { label: 'Italian', code: 'it' },
  { label: 'Portuguese', code: 'pt' },
  { label: 'Dutch', code: 'nl' },
  { label: 'Japanese', code: 'ja' },
  { label: 'Mandarin', code: 'zh' },
  { label: 'Korean', code: 'ko' },
  { label: 'Hindi', code: 'hi' },
  { label: 'Russian', code: 'ru' },
  { label: 'Polish', code: 'pl' },
  { label: 'Swedish', code: 'sv' },
];

/** Storage value used in the settings table — `null` becomes `'auto'` so
 *  the row exists once the user has touched the picker. */
export type TranscriptLanguageStored = 'auto' | string;

export function languageToStored(code: string | null): TranscriptLanguageStored {
  return code ?? 'auto';
}

export function storedToLanguage(
  stored: string | null,
): string | undefined {
  if (!stored || stored === 'auto') return undefined;
  return stored;
}
