// Per-meeting / folder / global AI chat. Builds a system prompt with grounding
// from the active scope, sends the conversation to the configured LLM, and
// returns the assistant message + token usage.

import type { ChatMessage, Meeting, Recipe } from '@shared/types.js';
import { formatTranscript } from './enhancer.js';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export type ChatProvider = 'anthropic' | 'openai' | 'openrouter';

export type ChatScope =
  | { kind: 'meeting'; meeting: Meeting }
  | { kind: 'folder'; folderName: string; meetings: Meeting[] }
  | { kind: 'global'; meetings: Meeting[] };

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRunOptions {
  scope: ChatScope;
  history: ChatTurn[];
  userMessage: string;
  recipe: Recipe | null;
  anthropicKey?: string | null;
  openaiKey?: string | null;
  openrouterKey?: string | null;
  preferred?: ChatProvider;
  fetchImpl?: typeof fetch;
}

export interface ChatRunResult {
  content: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
}

export class ChatError extends Error {}

const MAX_TRANSCRIPT_CHARS = 16_000;
const MAX_GLOBAL_MEETINGS = 25;
const PER_MEETING_SUMMARY_CHARS = 1_400;

export function buildSystemPrompt(opts: {
  scope: ChatScope;
  recipe: Recipe | null;
}): string {
  const { scope, recipe } = opts;
  const base = `You are Quill, the user's meeting assistant. Answer their question using only the context provided. If the context doesn't contain the answer, say so plainly — never fabricate. Be concise. Quote the transcript verbatim when it sharpens the answer.`;

  const recipeBlock = recipe
    ? `\n\n## Active recipe: ${recipe.name}\n${recipe.prompt.trim()}`
    : '';

  const context = buildContextBlock(scope);

  return `${base}${recipeBlock}\n\n## Context\n${context}`;
}

function buildContextBlock(scope: ChatScope): string {
  if (scope.kind === 'meeting') return meetingContext(scope.meeting);
  if (scope.kind === 'folder') {
    return [
      `Folder: **${scope.folderName}** (${scope.meetings.length} meetings).`,
      '',
      multiMeetingContext(scope.meetings),
    ].join('\n');
  }
  return [
    `Recent meetings (most recent first, up to ${MAX_GLOBAL_MEETINGS}):`,
    '',
    multiMeetingContext(scope.meetings.slice(0, MAX_GLOBAL_MEETINGS)),
  ].join('\n');
}

function meetingContext(meeting: Meeting): string {
  const transcript = formatTranscript(meeting.transcript);
  const trimmedTranscript = truncate(transcript, MAX_TRANSCRIPT_CHARS);
  const parts = [
    `# ${meeting.title}`,
    `Started: ${formatHumanDate(meeting.startedAt)}`,
    '',
    '## Raw notes',
    meeting.rawNotes.trim() || '(no notes)',
  ];
  if (meeting.enhancedNotes) {
    parts.push('', '## Enhanced notes', meeting.enhancedNotes.trim());
  }
  parts.push('', '## Transcript', trimmedTranscript || '(no transcript)');
  return parts.join('\n');
}

function multiMeetingContext(meetings: Meeting[]): string {
  if (meetings.length === 0) return '(no meetings yet)';
  return meetings
    .map((m) => {
      const summary =
        m.enhancedNotes?.trim() || m.rawNotes.trim() || formatTranscript(m.transcript);
      return [
        `### ${m.title} — ${formatHumanDate(m.startedAt)}`,
        truncate(summary, PER_MEETING_SUMMARY_CHARS),
      ].join('\n');
    })
    .join('\n\n');
}

/** Render a stored ISO timestamp as a friendly human-readable date for the
 *  chat context. The LLM tends to echo whatever format we feed it, so a
 *  raw ISO string surfaces as "2026-05-08 at 15:50:26 UTC" in answers.
 *  This produces "Fri, May 8 2026 · 15:50" — readable in any locale and
 *  unambiguous about the day. */
export function formatHumanDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const weekday = d.toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });
  const month = d.toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const mins = String(d.getUTCMinutes()).padStart(2, '0');
  return `${weekday}, ${month} ${day} ${year} · ${hours}:${mins}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…(truncated)`;
}

export async function runChat(opts: ChatRunOptions): Promise<ChatRunResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const system = buildSystemPrompt({ scope: opts.scope, recipe: opts.recipe });
  const messages: ChatTurn[] = [
    ...opts.history,
    { role: 'user', content: opts.userMessage },
  ];

  const order = pickProviderOrder(opts);
  for (const provider of order) {
    if (provider === 'anthropic' && opts.anthropicKey) {
      return callAnthropic(system, messages, opts.anthropicKey, fetchImpl);
    }
    if (provider === 'openai' && opts.openaiKey) {
      return callOpenAI(system, messages, opts.openaiKey, fetchImpl);
    }
    if (provider === 'openrouter' && opts.openrouterKey) {
      return callOpenRouter(system, messages, opts.openrouterKey, fetchImpl);
    }
  }
  throw new ChatError(
    'No chat key configured. Set Anthropic, OpenAI, or OpenRouter key in Settings.',
  );
}

function pickProviderOrder(opts: ChatRunOptions): ChatProvider[] {
  // OpenRouter first when set — same priority rule as the enhancer.
  // Cheap Haiku route is the preferred default, with Anthropic/OpenAI
  // as fallbacks if no OpenRouter key is configured.
  const defaults: ChatProvider[] = ['openrouter', 'anthropic', 'openai'];
  if (!opts.preferred) return defaults;
  return [opts.preferred, ...defaults.filter((p) => p !== opts.preferred)];
}

async function callAnthropic(
  system: string,
  messages: ChatTurn[],
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<ChatRunResult> {
  const model = 'claude-sonnet-4-6';
  const body = {
    model,
    max_tokens: 2048,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
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
    throw new ChatError(`Anthropic API ${res.status}: ${errText}`);
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
    content: text.trim(),
    modelUsed: model,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
  };
}

async function callOpenAI(
  system: string,
  messages: ChatTurn[],
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<ChatRunResult> {
  const model = 'gpt-4o';
  const body = {
    model,
    temperature: 0.3,
    messages: [
      { role: 'system', content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
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
    throw new ChatError(`OpenAI API ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    content: (data.choices[0]?.message.content ?? '').trim(),
    modelUsed: model,
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens,
  };
}

async function callOpenRouter(
  system: string,
  messages: ChatTurn[],
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<ChatRunResult> {
  const model = 'anthropic/claude-haiku-4.5';
  const body = {
    model,
    temperature: 0.3,
    messages: [
      { role: 'system', content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
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
    throw new ChatError(`OpenRouter API ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    content: (data.choices[0]?.message.content ?? '').trim(),
    modelUsed: `openrouter:${model}`,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

export function historyToTurns(messages: ChatMessage[]): ChatTurn[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}
