import { describe, it, expect, vi } from 'vitest';
import {
  __sanitizeIdForTesting,
  pickTemplate,
} from '../../src/main/services/template-picker.js';
import type { TemplateChoice } from '../../src/shared/template-picker.js';
import type { TranscriptEntry } from '../../src/shared/types.js';

const TEMPLATES: TemplateChoice[] = [
  { id: 'generic', name: 'Generic Meeting', description: 'All-purpose.' },
  { id: 'one-on-one', name: '1-on-1', description: 'Manager/direct-report.' },
  { id: 'standup', name: 'Stand-up', description: 'Daily team stand-up.' },
  { id: 'pitch', name: 'Pitch', description: 'Investor or partnership pitch.' },
  {
    id: 'customer-discovery',
    name: 'Customer Discovery',
    description: 'JTBD, pains, current solutions.',
  },
  {
    id: 'user-interview',
    name: 'User Interview',
    description: 'Interviewing users about a workflow.',
  },
];

const sampleTranscript: TranscriptEntry[] = Array.from({ length: 6 }, (_, i) => ({
  id: `t${i}`,
  meetingId: 'm1',
  speaker: i % 2 === 0 ? 'mic' : 'system',
  text: `chunk ${i} discussing yesterday's blockers and today's plan and friction with the build`,
  startedAtMs: i * 5000,
  durationMs: 5000,
}));

describe('sanitizeId', () => {
  it('lowercases and trims', () => {
    expect(__sanitizeIdForTesting('  GENERIC ')).toBe('generic');
  });

  it('strips quotes / backticks / asterisks / trailing punctuation', () => {
    expect(__sanitizeIdForTesting('"standup".')).toBe('standup');
    expect(__sanitizeIdForTesting("'pitch';")).toBe('pitch');
    expect(__sanitizeIdForTesting('**generic**')).toBe('generic');
  });

  it('keeps the last token when the model adds a prefix', () => {
    expect(__sanitizeIdForTesting('Best template id: pitch')).toBe('pitch');
  });

  it('returns null for empty input', () => {
    expect(__sanitizeIdForTesting('')).toBeNull();
    expect(__sanitizeIdForTesting('   ')).toBeNull();
    expect(__sanitizeIdForTesting(null)).toBeNull();
    expect(__sanitizeIdForTesting(undefined)).toBeNull();
  });
});

describe('pickTemplate', () => {
  it('falls back to "generic" when no LLM key is set', async () => {
    const id = await pickTemplate({
      transcript: sampleTranscript,
      rawNotes: '',
      templates: TEMPLATES,
    });
    expect(id).toBe('generic');
  });

  it('falls back to "generic" when transcript is too short to route', async () => {
    const id = await pickTemplate({
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
      templates: TEMPLATES,
      anthropicKey: 'sk-ant-test',
    });
    expect(id).toBe('generic');
  });

  it('uses the LLM-chosen id when valid', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'standup' } }],
      }),
    });
    const id = await pickTemplate({
      transcript: sampleTranscript,
      rawNotes: '',
      templates: TEMPLATES,
      openrouterKey: 'sk-or-test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(id).toBe('standup');
  });

  it('falls back to generic when the LLM returns an unknown id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'made-up-template' } }],
      }),
    });
    const id = await pickTemplate({
      transcript: sampleTranscript,
      rawNotes: '',
      templates: TEMPLATES,
      openrouterKey: 'sk-or-test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(id).toBe('generic');
  });

  it('falls back to generic when the LLM call errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error',
    });
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const id = await pickTemplate({
      transcript: sampleTranscript,
      rawNotes: '',
      templates: TEMPLATES,
      openrouterKey: 'sk-or-test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(id).toBe('generic');
    consoleSpy.mockRestore();
  });

  it('uses the first template when no "generic" exists in the list', async () => {
    const customTemplates: TemplateChoice[] = [
      { id: 'tpl-foo', name: 'Foo', description: 'Foo template.' },
      { id: 'tpl-bar', name: 'Bar', description: 'Bar template.' },
    ];
    const id = await pickTemplate({
      transcript: sampleTranscript,
      rawNotes: '',
      templates: customTemplates,
    });
    expect(id).toBe('tpl-foo');
  });
});
