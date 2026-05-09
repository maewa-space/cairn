import { describe, it, expect, vi } from 'vitest';
import {
  buildSystemPrompt,
  runChat,
  ChatError,
  historyToTurns,
  type ChatScope,
} from '../../src/main/services/chat.js';
import type {
  ChatMessage,
  Meeting,
  Recipe,
} from '../../src/shared/types.js';

const meeting: Meeting = {
  id: 'm1',
  title: 'Discovery with Alex',
  startedAt: '2026-05-08T10:00:00Z',
  endedAt: '2026-05-08T10:30:00Z',
  rawNotes: 'Alex mentioned trouble with search.',
  enhancedNotes: null,
  templateId: null,
  folderId: null,
  calendarEventId: null,
  attendees: [],
  transcript: [
    {
      id: 't1',
      meetingId: 'm1',
      speaker: 'system',
      text: 'Search is just impossible to navigate.',
      startedAtMs: 1000,
      durationMs: 3000,
    },
    {
      id: 't2',
      meetingId: 'm1',
      speaker: 'mic',
      text: 'Got it — what would the ideal version do?',
      startedAtMs: 5000,
      durationMs: 2500,
    },
  ],
};

const coachRecipe: Recipe = {
  id: 'coach',
  trigger: 'coach',
  name: 'Coach',
  description: 'Coaching review.',
  scope: 'meeting',
  prompt: 'Be candid and specific. Quote the transcript.',
  builtIn: true,
  createdAt: '2026-05-01',
};

describe('buildSystemPrompt', () => {
  it('embeds meeting transcript and notes for meeting scope', () => {
    const scope: ChatScope = { kind: 'meeting', meeting };
    const prompt = buildSystemPrompt({ scope, recipe: null });
    expect(prompt).toContain('# Discovery with Alex');
    expect(prompt).toContain('Search is just impossible');
    expect(prompt).toContain('Alex mentioned trouble with search');
    expect(prompt).not.toContain('Active recipe');
  });

  it('appends recipe block when a recipe is active', () => {
    const scope: ChatScope = { kind: 'meeting', meeting };
    const prompt = buildSystemPrompt({ scope, recipe: coachRecipe });
    expect(prompt).toContain('## Active recipe: Coach');
    expect(prompt).toContain('Be candid and specific');
  });

  it('summarizes folder meetings for folder scope', () => {
    const scope: ChatScope = {
      kind: 'folder',
      folderName: 'Customers',
      meetings: [meeting],
    };
    const prompt = buildSystemPrompt({ scope, recipe: null });
    expect(prompt).toContain('Folder: **Customers**');
    expect(prompt).toContain('### Discovery with Alex');
  });

  it('caps global scope to most recent meetings list', () => {
    const meetings: Meeting[] = Array.from({ length: 30 }, (_, i) => ({
      ...meeting,
      id: `m${i}`,
      title: `Meeting ${i}`,
    }));
    const scope: ChatScope = { kind: 'global', meetings };
    const prompt = buildSystemPrompt({ scope, recipe: null });
    expect(prompt).toContain('Meeting 0');
    expect(prompt).toContain('Meeting 24');
    expect(prompt).not.toContain('Meeting 25');
  });
});

describe('runChat', () => {
  it('routes to OpenAI with the chat history', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain('openai.com');
      const body = JSON.parse(init?.body as string) as {
        messages: { role: string; content: string }[];
      };
      const userTurns = body.messages.filter((m) => m.role === 'user');
      expect(userTurns[userTurns.length - 1].content).toBe('What hurts most?');
      // history is included
      expect(userTurns.length).toBeGreaterThan(1);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Search.' } }],
          usage: { prompt_tokens: 100, completion_tokens: 5 },
        }),
        { status: 200 },
      );
    });

    const result = await runChat({
      scope: { kind: 'meeting', meeting },
      history: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
      ],
      userMessage: 'What hurts most?',
      recipe: null,
      anthropicKey: null,
      openaiKey: 'sk-openai',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.content).toBe('Search.');
    expect(result.modelUsed).toBe('gpt-4o');
    expect(result.inputTokens).toBe(100);
  });

  it('prefers Anthropic when both keys are present', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('anthropic.com');
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'Hi back.' }],
          usage: { input_tokens: 50, output_tokens: 4 },
        }),
        { status: 200 },
      );
    });
    const result = await runChat({
      scope: { kind: 'meeting', meeting },
      history: [],
      userMessage: 'hi',
      recipe: null,
      anthropicKey: 'sk-ant',
      openaiKey: 'sk-openai',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.modelUsed).toBe('claude-sonnet-4-6');
  });

  it('falls back to OpenRouter when only that key is set', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('openrouter.ai');
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'router resp' } }],
          usage: { prompt_tokens: 12, completion_tokens: 3 },
        }),
        { status: 200 },
      );
    });
    const result = await runChat({
      scope: { kind: 'global', meetings: [meeting] },
      history: [],
      userMessage: 'go',
      recipe: null,
      openrouterKey: 'sk-or',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.modelUsed).toMatch(/^openrouter:/);
  });

  it('throws ChatError when no key is configured', async () => {
    await expect(
      runChat({
        scope: { kind: 'global', meetings: [] },
        history: [],
        userMessage: 'x',
        recipe: null,
      }),
    ).rejects.toBeInstanceOf(ChatError);
  });
});

describe('historyToTurns', () => {
  it('maps ChatMessage rows to {role, content} turns', () => {
    const messages: ChatMessage[] = [
      {
        id: '1',
        meetingId: 'm1',
        folderId: null,
        role: 'user',
        content: 'hi',
        recipeId: null,
        createdAt: '',
        inputTokens: null,
        outputTokens: null,
        model: null,
      },
      {
        id: '2',
        meetingId: 'm1',
        folderId: null,
        role: 'assistant',
        content: 'hello',
        recipeId: null,
        createdAt: '',
        inputTokens: 10,
        outputTokens: 5,
        model: 'x',
      },
    ];
    expect(historyToTurns(messages)).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });
});
