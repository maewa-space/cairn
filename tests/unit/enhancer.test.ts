import { describe, it, expect, vi } from 'vitest';
import {
  enhance,
  buildPrompt,
  formatTranscript,
  EnhancerError,
} from '../../src/main/services/enhancer.js';
import type { Template, TranscriptEntry } from '../../src/shared/types.js';

const template: Template = {
  id: 'standup',
  name: 'Stand-up',
  description: '',
  systemPrompt: 'You are a stand-up scribe. Be terse.',
  body: '## Per attendee\n\n## Action items',
  builtIn: true,
  createdAt: '2026-01-01',
};

const transcript: TranscriptEntry[] = [
  {
    id: '1',
    meetingId: 'm1',
    speaker: 'system',
    text: 'Yesterday I shipped the migration.',
    startedAtMs: 0,
    durationMs: 4000,
  },
  {
    id: '2',
    meetingId: 'm1',
    speaker: 'mic',
    text: 'I was going to ask — any blockers on auth?',
    startedAtMs: 5000,
    durationMs: 3000,
  },
];

describe('enhancer.formatTranscript', () => {
  it('tags each line with speaker and timestamp', () => {
    const text = formatTranscript(transcript);
    expect(text).toContain('[00:00] Other:');
    expect(text).toContain('[00:05] Me:');
    expect(text).toContain('shipped the migration');
  });
});

describe('enhancer.buildPrompt', () => {
  it('includes raw notes and transcript in user message', () => {
    const { system, user } = buildPrompt({
      rawNotes: 'rough scribbles',
      transcript,
      template,
    });
    expect(system).toContain('stand-up scribe');
    expect(system).toContain('Per attendee');
    expect(user).toContain('rough scribbles');
    expect(user).toContain('Other:');
    expect(user).toContain('Me:');
  });

  it('falls back to no-notes message when notes are empty', () => {
    const { user } = buildPrompt({ rawNotes: '   ', transcript, template });
    expect(user).toContain('(no notes taken during the meeting)');
  });
});

describe('enhancer.enhance', () => {
  it('calls Anthropic when key present, prefers it over OpenAI', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain('anthropic.com');
      const body = JSON.parse(init?.body as string);
      expect(body.model).toBe('claude-sonnet-4-6');
      expect(body.system[0].cache_control).toBeDefined();
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: '## Per attendee\n- foo' }],
          usage: { input_tokens: 200, output_tokens: 25 },
        }),
        { status: 200 },
      );
    });
    const result = await enhance({
      rawNotes: 'x',
      transcript,
      template,
      anthropicKey: 'sk-ant',
      openaiKey: 'sk-openai',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.markdown).toContain('Per attendee');
    expect(result.modelUsed).toBe('claude-sonnet-4-6');
    expect(result.inputTokens).toBe(200);
  });

  it('falls back to OpenAI when only OpenAI key is set', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('openai.com');
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'enhanced text' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200 },
      );
    });
    const result = await enhance({
      rawNotes: 'x',
      transcript,
      template,
      anthropicKey: null,
      openaiKey: 'sk-openai',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.markdown).toBe('enhanced text');
    expect(result.modelUsed).toBe('gpt-4o');
  });

  it('throws when no key is configured', async () => {
    await expect(
      enhance({
        rawNotes: 'x',
        transcript,
        template,
        anthropicKey: null,
        openaiKey: null,
      }),
    ).rejects.toBeInstanceOf(EnhancerError);
  });

  it('routes to OpenRouter when only that key is set', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain('openrouter.ai');
      const body = JSON.parse(init?.body as string);
      expect(body.model).toMatch(/claude-haiku/);
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer sk-or-test');
      expect(headers['HTTP-Referer']).toContain('quill');
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'cheap enhanced' } }],
          usage: { prompt_tokens: 50, completion_tokens: 10 },
        }),
        { status: 200 },
      );
    });
    const result = await enhance({
      rawNotes: 'x',
      transcript,
      template,
      anthropicKey: null,
      openaiKey: null,
      openrouterKey: 'sk-or-test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.markdown).toBe('cheap enhanced');
    expect(result.modelUsed).toMatch(/^openrouter:/);
    expect(result.inputTokens).toBe(50);
  });

  it('prefers OpenRouter when all three keys are set (cheap-by-default)', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      // OpenRouter is now the default-preferred provider when present —
      // routes to a cheap model (Claude Haiku) without requiring users to
      // pass `preferred` explicitly.
      expect(url).toContain('openrouter.ai');
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'cheap-by-default' } }],
          usage: { prompt_tokens: 8, completion_tokens: 2 },
        }),
        { status: 200 },
      );
    });
    const result = await enhance({
      rawNotes: 'x',
      transcript,
      template,
      anthropicKey: 'sk-ant',
      openaiKey: 'sk-openai',
      openrouterKey: 'sk-or-test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.modelUsed).toMatch(/^openrouter:/);
    expect(result.markdown).toBe('cheap-by-default');
  });

  it('honors preferred=openrouter even when other keys exist', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('openrouter.ai');
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'preferred path' } }],
          usage: { prompt_tokens: 12, completion_tokens: 4 },
        }),
        { status: 200 },
      );
    });
    const result = await enhance({
      rawNotes: 'x',
      transcript,
      template,
      anthropicKey: 'sk-ant',
      openaiKey: 'sk-openai',
      openrouterKey: 'sk-or-test',
      preferred: 'openrouter',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.modelUsed).toMatch(/^openrouter:/);
    expect(result.markdown).toBe('preferred path');
  });
});
