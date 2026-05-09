// LLM-based template chooser for the meeting Enhance flow.
//
// Given the transcript + raw notes + the user's available templates, ask
// the cheapest configured provider which template fits best. Returns one
// of the supplied template ids. Falls back to "generic" (or the first
// template) when no LLM key is set or the model returns junk — never
// throws, so the caller can always proceed with enhance.

import { formatTranscript } from './enhancer.js';
import type { TemplateChoice } from '@shared/template-picker.js';
import type { TranscriptEntry } from '@shared/types.js';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM_PROMPT = `You are a meeting template router. Given a conversation transcript and a list of available note-taking templates, pick the single best-fitting template id. Output the template id only — no explanations, no quotes, no extra words. If nothing fits cleanly, output "generic".`;

const MIN_CORPUS_CHARS = 60;
const MAX_CORPUS_CHARS = 3_500;

export interface PickTemplateOptions {
  transcript: TranscriptEntry[];
  rawNotes: string;
  enhancedNotes?: string | null;
  templates: TemplateChoice[];
  anthropicKey?: string | null;
  openaiKey?: string | null;
  openrouterKey?: string | null;
  fetchImpl?: typeof fetch;
}

/** Returns the chosen template id. Always returns a valid id from the
 *  supplied list — falls back to "generic" or the first available when
 *  the LLM is missing/unhelpful. */
export async function pickTemplate(
  opts: PickTemplateOptions,
): Promise<string> {
  const fallback = chooseFallback(opts.templates);

  // Need at least *some* content to make a meaningful choice. With less
  // than a sentence of transcript, generic is the right default.
  const enhanced = opts.enhancedNotes?.trim() ?? '';
  const corpus = enhanced
    ? enhanced
    : [opts.rawNotes.trim(), formatTranscript(opts.transcript)]
        .filter(Boolean)
        .join('\n');
  if (corpus.length < MIN_CORPUS_CHARS) return fallback;

  const trimmed =
    corpus.length > MAX_CORPUS_CHARS
      ? `${corpus.slice(0, MAX_CORPUS_CHARS)}\n…(truncated)`
      : corpus;

  const userPrompt = buildUserPrompt(trimmed, opts.templates);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const validIds = new Set(opts.templates.map((t) => t.id));

  try {
    let raw: string | null = null;
    if (opts.openrouterKey) {
      raw = await callOpenRouter(userPrompt, opts.openrouterKey, fetchImpl);
    } else if (opts.anthropicKey) {
      raw = await callAnthropic(userPrompt, opts.anthropicKey, fetchImpl);
    } else if (opts.openaiKey) {
      raw = await callOpenAI(userPrompt, opts.openaiKey, fetchImpl);
    }
    const cleaned = sanitizeId(raw);
    if (cleaned && validIds.has(cleaned)) return cleaned;
  } catch (err) {
    console.warn('[template-picker] LLM call failed:', err);
  }
  return fallback;
}

function buildUserPrompt(corpus: string, templates: TemplateChoice[]): string {
  const list = templates
    .map((t) => `- ${t.id}: ${t.name} — ${t.description}`)
    .join('\n');
  return `Available templates:\n${list}\n\nConversation:\n\n${corpus}\n\nBest template id:`;
}

function chooseFallback(templates: TemplateChoice[]): string {
  const generic = templates.find((t) => t.id === 'generic');
  if (generic) return generic.id;
  return templates[0]?.id ?? 'generic';
}

/** Strip whitespace / quotes / trailing punctuation; lowercase. Used to
 *  normalize the LLM's single-token answer before validating it against
 *  the supplied id list. */
function sanitizeId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Repeatedly peel surrounding quotes / asterisks / punctuation until the
  // string stops shrinking. Necessary because the model can wrap the id
  // in multiple decorations like '"standup".' which a single pass leaves
  // half-stripped.
  let cur = raw.trim();
  for (let i = 0; i < 5; i++) {
    const next = cur
      .replace(/^["'`*]+|["'`*]+$/g, '')
      .replace(/[.,;:!?]+$/g, '')
      .trim();
    if (next === cur) break;
    cur = next;
  }
  if (!cur) return null;
  // The model occasionally adds a "Best template id:" prefix back; strip
  // anything before the last whitespace if the result is multi-token.
  const tokens = cur.split(/\s+/);
  return (tokens[tokens.length - 1] ?? '').toLowerCase();
}

async function callAnthropic(
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
      max_tokens: 32,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text ?? '';
}

async function callOpenRouter(
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
      max_tokens: 32,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? '';
}

async function callOpenAI(
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
      max_tokens: 32,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? '';
}

/** Test seam — exposed for unit tests of the sanitizer. */
export const __sanitizeIdForTesting = sanitizeId;
