// Merges raw notes + transcript with a chosen template,
// calls Claude (preferred) or OpenAI, returns enhanced markdown.

import type { TranscriptEntry } from '@shared/types.js';
import type { Template } from '@shared/types.js';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export interface EnhanceOptions {
  rawNotes: string;
  transcript: TranscriptEntry[];
  template: Template;
  anthropicKey?: string | null;
  openaiKey?: string | null;
  openrouterKey?: string | null;
  preferred?: 'anthropic' | 'openai' | 'openrouter';
  fetchImpl?: typeof fetch;
}

export interface EnhanceResult {
  markdown: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
}

export class EnhancerError extends Error {}

export function formatTranscript(entries: TranscriptEntry[]): string {
  return entries
    .map((e) => {
      const speaker = enhancerSpeakerLabel(e.speaker);
      const ts = msToClock(e.startedAtMs);
      return `[${ts}] ${speaker}: ${e.text}`;
    })
    .join('\n');
}

function enhancerSpeakerLabel(speaker: TranscriptEntry['speaker']): string {
  if (speaker === 'mic') return 'Me';
  if (speaker === 'system') return 'Other';
  if (typeof speaker === 'string' && speaker.startsWith('speaker-')) {
    const n = Number.parseInt(speaker.slice('speaker-'.length), 10);
    return Number.isFinite(n) ? `Speaker ${n}` : 'Other';
  }
  return 'Other';
}

function msToClock(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function buildPrompt(opts: {
  rawNotes: string;
  transcript: TranscriptEntry[];
  template: Template;
}): { system: string; user: string } {
  const { rawNotes, transcript, template } = opts;
  const transcriptText = formatTranscript(transcript);
  const system = `${template.systemPrompt}

When you respond, output ONLY the structured markdown writeup — no preamble, no postscript. Use the section structure that follows. Stay grounded in the source material; do not invent facts, names, or decisions.

# Output structure

${template.body}`;

  const user = `# Rough notes from the user

${rawNotes.trim() || '(no notes taken during the meeting)'}

# Transcript

${transcriptText || '(no transcript available)'}`;

  return { system, user };
}

export async function enhance(opts: EnhanceOptions): Promise<EnhanceResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const prompt = buildPrompt(opts);

  // Build provider order: explicit preference first, then defaults
  // (anthropic → openai → openrouter for the most-capable-first ordering).
  const order = pickProviderOrder(opts);
  for (const provider of order) {
    if (provider === 'anthropic' && opts.anthropicKey) {
      return callAnthropic(prompt, opts.anthropicKey, fetchImpl);
    }
    if (provider === 'openai' && opts.openaiKey) {
      return callOpenAI(prompt, opts.openaiKey, fetchImpl);
    }
    if (provider === 'openrouter' && opts.openrouterKey) {
      return callOpenRouter(prompt, opts.openrouterKey, fetchImpl);
    }
  }
  throw new EnhancerError(
    'No enhancement key configured. Set Anthropic, OpenAI, or OpenRouter key in Settings.',
  );
}

function pickProviderOrder(
  opts: EnhanceOptions,
): Array<'anthropic' | 'openai' | 'openrouter'> {
  // OpenRouter first when set: it routes to a cheap-but-capable model
  // (Claude Haiku 4.5) and consolidates billing, so users who set it
  // explicitly want it preferred. Anthropic and OpenAI remain as fallbacks
  // when no OpenRouter key is configured.
  const defaults: Array<'anthropic' | 'openai' | 'openrouter'> = [
    'openrouter',
    'anthropic',
    'openai',
  ];
  if (!opts.preferred) return defaults;
  return [opts.preferred, ...defaults.filter((p) => p !== opts.preferred)];
}

async function callAnthropic(
  prompt: { system: string; user: string },
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<EnhanceResult> {
  const model = 'claude-sonnet-4-6';
  const body = {
    model,
    max_tokens: 4096,
    system: [
      { type: 'text', text: prompt.system, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: prompt.user }],
  };

  const res = await fetchImpl(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new EnhancerError(`Anthropic API ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as {
    content: { type: string; text: string }[];
    usage: { input_tokens: number; output_tokens: number };
  };
  const text = data.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
  return {
    markdown: text.trim(),
    modelUsed: model,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
  };
}

async function callOpenRouter(
  prompt: { system: string; user: string },
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<EnhanceResult> {
  // Default to a cheap-but-strong model on OpenRouter; users can change via env later.
  const model = 'anthropic/claude-haiku-4.5';
  const body = {
    model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
  };
  const res = await fetchImpl(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/maewa-space/quill',
      'X-Title': 'Quill',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new EnhancerError(`OpenRouter API ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    markdown: (data.choices[0]?.message.content ?? '').trim(),
    modelUsed: `openrouter:${model}`,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

async function callOpenAI(
  prompt: { system: string; user: string },
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<EnhanceResult> {
  const model = 'gpt-4o';
  const body = {
    model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
  };
  const res = await fetchImpl(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new EnhancerError(`OpenAI API ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    markdown: (data.choices[0]?.message.content ?? '').trim(),
    modelUsed: model,
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens,
  };
}
