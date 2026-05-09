import { describe, it, expect } from 'vitest';
import {
  renderPdfHtml,
  renderPdfFooterTemplate,
  renderPdfHeaderTemplate,
} from '../../src/main/services/pdf-template.js';
import { pickDefaultPageSize } from '../../src/main/services/pdf.js';
import type { Meeting } from '../../src/shared/types.js';

const baseMeeting: Pick<
  Meeting,
  'title' | 'startedAt' | 'rawNotes' | 'enhancedNotes' | 'transcript'
> = {
  title: 'Q3 customer interview',
  startedAt: '2026-05-08T14:02:00.000Z',
  rawNotes: '<p>raw scratch</p>',
  enhancedNotes: null,
  transcript: [],
};

describe('renderPdfHtml', () => {
  it('renders a complete HTML document with masthead labels', () => {
    const html = renderPdfHtml({
      meeting: baseMeeting,
      issueLabel: 'QUILL — VOL. I · ISSUE 23',
      dateLabel: 'WED, MAY 8, 2026',
    });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('QUILL — VOL. I · ISSUE 23');
    expect(html).toContain('WED, MAY 8, 2026');
    expect(html).toContain('<h1 class="title">Q3 customer interview</h1>');
  });

  it('uses the enhanced body modifier (drop cap) when enhancedNotes present', () => {
    const html = renderPdfHtml({
      meeting: {
        ...baseMeeting,
        enhancedNotes: '# Recap\n\nThe customer brought up search again.',
      },
      issueLabel: 'QUILL — VOL. I · ISSUE 1',
      dateLabel: 'WED, MAY 8, 2026',
    });
    expect(html).toContain('class="body body--enhanced"');
    expect(html).toContain('<h1>Recap</h1>');
  });

  it('omits the body--enhanced modifier when only raw notes present', () => {
    const html = renderPdfHtml({
      meeting: { ...baseMeeting, enhancedNotes: null },
      issueLabel: 'QUILL — VOL. I · ISSUE 1',
      dateLabel: 'WED, MAY 8, 2026',
    });
    expect(html).toContain('<article class="body">');
    expect(html).not.toMatch(/<article class="body body--enhanced/);
  });

  it('escapes HTML in titles and metadata', () => {
    const html = renderPdfHtml({
      meeting: {
        ...baseMeeting,
        title: '<img src=x onerror=alert(1)>',
      },
      issueLabel: 'QUILL — VOL. I · ISSUE 1',
      dateLabel: 'WED, MAY 8, 2026',
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('omits the transcript section when no entries are present', () => {
    const html = renderPdfHtml({
      meeting: baseMeeting,
      issueLabel: 'QUILL — VOL. I · ISSUE 1',
      dateLabel: 'WED, MAY 8, 2026',
    });
    expect(html).not.toContain('Transcript');
  });

  it('summarizes a long transcript instead of inlining it', () => {
    const transcript = Array.from({ length: 60 }, (_, i) => ({
      id: `t-${i}`,
      meetingId: 'm-1',
      speaker: i % 2 === 0 ? ('mic' as const) : ('system' as const),
      text: `entry ${i}`,
      startedAtMs: i * 1000,
      durationMs: 1000,
    }));
    const html = renderPdfHtml({
      meeting: { ...baseMeeting, transcript },
      issueLabel: 'QUILL — VOL. I · ISSUE 1',
      dateLabel: 'WED, MAY 8, 2026',
    });
    expect(html).toContain('Transcript omitted — 60 entries.');
  });

  it('inlines short transcripts with mono datelines', () => {
    const transcript = [
      {
        id: 't-1',
        meetingId: 'm-1',
        speaker: 'mic' as const,
        text: 'hello there',
        startedAtMs: 65_000,
        durationMs: 4000,
      },
    ];
    const html = renderPdfHtml({
      meeting: { ...baseMeeting, transcript },
      issueLabel: 'QUILL — VOL. I · ISSUE 1',
      dateLabel: 'WED, MAY 8, 2026',
    });
    expect(html).toContain('class="transcript-eyebrow"');
    expect(html).toContain('You · 01:05');
    expect(html).toContain('hello there');
  });
});

describe('renderPdfFooterTemplate', () => {
  it('contains pageNumber and totalPages tokens for Chromium', () => {
    const footer = renderPdfFooterTemplate();
    expect(footer).toContain('class="pageNumber"');
    expect(footer).toContain('class="totalPages"');
    expect(footer).toContain('Quill — open notebook');
  });
});

describe('renderPdfHeaderTemplate', () => {
  it('returns a non-empty placeholder so Chromium accepts the option', () => {
    expect(renderPdfHeaderTemplate().length).toBeGreaterThan(0);
  });
});

describe('pickDefaultPageSize', () => {
  it('returns A4 for European locales', () => {
    expect(pickDefaultPageSize('de-DE')).toBe('A4');
    expect(pickDefaultPageSize('fr-FR')).toBe('A4');
    expect(pickDefaultPageSize('nl-NL')).toBe('A4');
  });
  it('returns Letter for non-European locales', () => {
    expect(pickDefaultPageSize('en-US')).toBe('Letter');
    expect(pickDefaultPageSize('en-GB')).toBe('Letter');
    expect(pickDefaultPageSize('ja-JP')).toBe('Letter');
  });
});
