import { describe, it, expect, vi } from 'vitest';
import {
  __cleanTitleForTesting,
  deriveTitle,
} from '../../src/main/services/title.js';
import type { TranscriptEntry } from '../../src/shared/types.js';

describe('cleanTitle', () => {
  it('strips surrounding quotes and asterisks', () => {
    expect(__cleanTitleForTesting('"Q3 Pricing Review"')).toBe('Q3 Pricing Review');
    expect(__cleanTitleForTesting("'Standup'")).toBe('Standup');
    expect(__cleanTitleForTesting('**Customer Sync**')).toBe('Customer Sync');
  });

  it('strips a trailing period', () => {
    expect(__cleanTitleForTesting('Customer Onboarding Plan.')).toBe(
      'Customer Onboarding Plan',
    );
  });

  it('collapses internal whitespace', () => {
    expect(__cleanTitleForTesting('Q3   Pricing\n\nReview')).toBe('Q3 Pricing Review');
  });

  it('returns null for empty input', () => {
    expect(__cleanTitleForTesting('')).toBeNull();
    expect(__cleanTitleForTesting('   ')).toBeNull();
  });

  it('rejects suspiciously long output (model ignored instructions)', () => {
    const long = 'A '.repeat(200);
    expect(__cleanTitleForTesting(long)).toBeNull();
  });
});

const sampleTranscript: TranscriptEntry[] = Array.from({ length: 10 }, (_, i) => ({
  id: `t${i}`,
  meetingId: 'm1',
  speaker: i % 2 === 0 ? 'mic' : 'system',
  text: `chunk ${i} talking about Q3 pricing review and discount tiers`,
  startedAtMs: i * 5000,
  durationMs: 5000,
}));

describe('deriveTitle', () => {
  it('returns null when no LLM key is configured', async () => {
    const t = await deriveTitle({
      transcript: sampleTranscript,
      rawNotes: '',
    });
    expect(t).toBeNull();
  });

  it('returns null when transcript is too short', async () => {
    const t = await deriveTitle({
      transcript: [
        {
          id: 't0',
          meetingId: 'm1',
          speaker: 'mic',
          text: 'hi',
          startedAtMs: 0,
          durationMs: 200,
        },
      ],
      rawNotes: '',
      anthropicKey: 'sk-ant-test',
    });
    expect(t).toBeNull();
  });

  it('calls OpenRouter when only that key is set and returns the cleaned title', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '"Q3 Pricing Review."' } }],
      }),
    });
    const t = await deriveTitle({
      transcript: sampleTranscript,
      rawNotes: '',
      openrouterKey: 'sk-or-test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(t).toBe('Q3 Pricing Review');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const url = (fetchImpl.mock.calls[0] as [string, unknown])[0];
    expect(url).toContain('openrouter.ai');
  });

  it('prefers OpenRouter > Anthropic > OpenAI', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: 'Customer Onboarding Plan' }],
      }),
    });
    const t = await deriveTitle({
      transcript: sampleTranscript,
      rawNotes: '',
      anthropicKey: 'sk-ant-test',
      openaiKey: 'sk-test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(t).toBe('Customer Onboarding Plan');
    const url = (fetchImpl.mock.calls[0] as [string, unknown])[0];
    expect(url).toContain('anthropic.com');
  });

  it('prefers enhanced notes over raw transcript when both are present', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Enhanced Title' } }],
      }),
    });
    await deriveTitle({
      transcript: sampleTranscript,
      rawNotes: 'raw scratch',
      enhancedNotes:
        '## Summary\nThe team reviewed Q3 pricing tiers and agreed on the discount strategy.',
      openrouterKey: 'sk-or-test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const body = JSON.parse(
      (fetchImpl.mock.calls[0] as [string, { body: string }])[1].body,
    ) as { messages: Array<{ role: string; content: string }> };
    const userMessage = body.messages.find((m) => m.role === 'user')!.content;
    // Enhanced notes carry the strongest signal — the prompt should be
    // built from them, not from the raw transcript.
    expect(userMessage).toContain('Q3 pricing tiers');
    expect(userMessage).not.toContain('chunk 0 talking about');
  });

  it('returns null when the LLM call fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error',
    });
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const t = await deriveTitle({
      transcript: sampleTranscript,
      rawNotes: '',
      openrouterKey: 'sk-or-test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(t).toBeNull();
    consoleSpy.mockRestore();
  });
});
