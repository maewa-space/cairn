// Transcript-based auto-titling for new meetings.
//
// Runs once per meeting, on Stop recording, when the meeting still has the
// default "Untitled meeting" title and there's enough transcript to derive
// something meaningful. Calls the cheapest configured provider with a small
// system prompt; falls back silently if no key is set or the LLM fails.

import { formatTranscript } from './enhancer.js';
import type { TranscriptEntry } from '@shared/types.js';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM_PROMPT =
  'You are a meeting titler. Given a conversation transcript, return a single 3-6 word title summarizing what the meeting is about. Output the title only — no quotes, no trailing punctuation, no explanations. Use Title Case.';

/** Minimum transcript length to attempt auto-titling. Anything shorter is
 *  noise — Whisper hallucinations, throat-clears, or an aborted recording.
 *  Below this threshold we leave the title at "Untitled meeting." */
const MIN_TRANSCRIPT_CHARS = 80;

/** Cap on transcript chars passed to the LLM. The first N tokens are usually
 *  enough — meetings tend to state their purpose up front. Saves tokens. */
const MAX_TRANSCRIPT_CHARS = 4_000;

/** Cap on title chars after we trim the LLM response. Anything longer is the
 *  model ignoring instructions; reject and keep the default. */
const MAX_TITLE_CHARS = 80;

export interface DeriveTitleOptions {
  transcript: TranscriptEntry[];
  rawNotes: string;
  anthropicKey?: string | null;
  openaiKey?: string | null;
  openrouterKey?: string | null;
  fetchImpl?: typeof fetch;
}

export class TitleError extends Error {}

/** Returns a 3-6 word title for the meeting, or null if nothing usable
 *  could be derived (no transcript, no LLM key, model refused, etc.). */
export async function deriveTitle(
  opts: DeriveTitleOptions,
): Promise<string | null> {
  const transcript = formatTranscript(opts.transcript);
  const corpus = [opts.rawNotes.trim(), transcript].filter(Boolean).join('\n');
  if (corpus.length < MIN_TRANSCRIPT_CHARS) return null;
  const trimmed = corpus.length > MAX_TRANSCRIPT_CHARS
    ? `${corpus.slice(0, MAX_TRANSCRIPT_CHARS)}\n…(truncated)`
    : corpus;

  const fetchImpl = opts.fetchImpl ?? fetch;
  const userPrompt = `Conversation:\n\n${trimmed}\n\nTitle:`;

  // Provider preference mirrors the enhancer: OpenRouter (cheap routing) →
  // Anthropic → OpenAI. Each call is ≤200 tokens output so cost is minimal.
  try {
    if (opts.openrouterKey) {
      const t = await callOpenRouterTitle(userPrompt, opts.openrouterKey, fetchImpl);
      return cleanTitle(t);
    }
    if (opts.anthropicKey) {
      const t = await callAnthropicTitle(userPrompt, opts.anthropicKey, fetchImpl);
      return cleanTitle(t);
    }
    if (opts.openaiKey) {
      const t = await callOpenAITitle(userPrompt, opts.openaiKey, fetchImpl);
      return cleanTitle(t);
    }
  } catch (err) {
    console.warn('[title] derivation failed:', err);
    return null;
  }
  return null;
}

function cleanTitle(raw: string): string | null {
  if (!raw) return null;
  // Strip surrounding quotes / backticks / asterisks and collapse whitespace.
  const stripped = raw
    .trim()
    .replace(/^["'`*]+|["'`*]+$/g, '')
    .replace(/\.$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return null;
  if (stripped.length > MAX_TITLE_CHARS) return null;
  return stripped;
}

async function callAnthropicTitle(
  userPrompt: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const res = await fetchImpl(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) throw new TitleError(`Anthropic ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    content?: Array<{ text?: string }>;
  };
  return data.content?.[0]?.text ?? '';
}

async function callOpenRouterTitle(
  userPrompt: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const res = await fetchImpl(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'anthropic/claude-haiku-4.5',
      max_tokens: 64,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new TitleError(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? '';
}

async function callOpenAITitle(
  userPrompt: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const res = await fetchImpl(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 64,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new TitleError(`OpenAI ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? '';
}

/** Test seam — exposed for unit tests of the cleanup helper. */
export const __cleanTitleForTesting = cleanTitle;
