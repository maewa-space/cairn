// Whisper hallucination detection.
//
// Whisper turns silent / instrumental / noisy audio into confident-sounding
// nonsense: "Thanks for watching", "please don't forget to like and subscribe",
// emoji strings, repeated single chars, or short phrases in unrelated
// languages (Swedish "Det går.", Spanish "Así es", Russian "Ничего").
//
// This module is the renderer-side dropper; the system audio path additionally
// gates by raw RMS in src/main/services/audio-tap.ts. Mic-side RMS gating
// lives in src/renderer/src/hooks/useAudioCapture.ts.
//
// Patterns are anchored at the start (^) but NOT the end — Whisper often
// extends YouTube-outro hallucinations into long compound phrases like
// "Thank you for watching and please don't forget to like, comment, share
// and subscribe..." which would never match an end-anchored regex.

const HALLUCINATION_PATTERNS: ReadonlyArray<RegExp> = [
  // YouTube-style outros — start-anchored, no trailing anchor
  /^thanks?\s+(for|so much for)\s+watching/i,
  /^thank\s+you\s+(so much\s+)?for\s+watching/i,
  /^thanks?\s+for\s+joining/i,
  /^please\s+(don['’]?t\s+forget\s+to|remember\s+to)\s+(like|subscribe)/i,
  /^(like|comment|share)[, ]+(and\s+)?(comment|share|subscribe)/i,
  /^subscribe\s+(to\s+(my|the|our)\s+channel|now|for\s+more)/i,
  /^see\s+you\s+(next\s+time|in\s+the\s+next\s+video)/i,
  // Substring catch for the compound YouTube phrase Whisper loves to invent
  /please\s+don['’]?t\s+forget\s+to\s+like[, ]+(and\s+)?(comment|share|subscribe)/i,
  // Standalone "Thank you." / "Thanks." — the single most common Whisper
  // hallucination on silent input. Real meeting chunks that contain only
  // "thank you" in a 10s window are vanishingly rare; if it slips through
  // because someone genuinely said only that, it's an acceptable miss.
  /^thank\s+you[\s.!]*$/i,
  /^thanks[\s.!]*$/i,
  // Filler / silence-only outputs
  /^bye[\s.!]*$/i,
  /^you[\s.!?]*$/i,
  /^(uh|um|hmm)+[\s.!]*$/i,
  /^silence[\s.!]*$/i,
  /^\[(music|silence|inaudible|applause|laughter)\]\s*$/i,
  // Common non-English hallucinations on silent input
  /^det\s+går[\s.!]*$/i,
  /^så\s+(är\s+det|gör\s+vi)[\s.!]*$/i,
  /^así\s+es[\s.!]*$/i,
  /^ничего[\s.!]*$/i,
  /^продолжение\s+следует/i,
];

const EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji}\u{1F300}-\u{1FAFF}]/u;

export function isHallucination(text: string): boolean {
  const t = text.trim();
  if (t.length < 3) return true;
  // Pure-emoji / emoji-spam output — Whisper does this on silent or musical audio.
  const stripped = t.replace(/[\s.!?,]/g, '');
  if (stripped.length > 0 && [...stripped].every((ch) => EMOJI_RE.test(ch))) {
    return true;
  }
  // Single repeated character (e.g. "🎵🎵🎵🎵", "...", "ahhhhh")
  if (stripped.length > 1 && new Set(stripped).size === 1) return true;
  return HALLUCINATION_PATTERNS.some((re) => re.test(t));
}
