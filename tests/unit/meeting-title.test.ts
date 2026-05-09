import { describe, it, expect } from 'vitest';
import {
  defaultMeetingTitle,
  looksLikeAutoTitle,
} from '../../src/shared/meeting-title.js';

describe('defaultMeetingTitle', () => {
  it('renders weekday + month + day + 24h time', () => {
    // Local-time constructor — runs against whatever zone the test host has.
    const fixed = new Date(2026, 4, 12, 14, 30); // Tue May 12 14:30 local
    expect(defaultMeetingTitle(fixed)).toBe('Tue May 12 · 14:30');
  });

  it('zero-pads minutes', () => {
    const fixed = new Date(2026, 0, 1, 9, 5); // Thu Jan 1 09:05
    expect(defaultMeetingTitle(fixed)).toBe('Thu Jan 1 · 09:05');
  });

  it('falls back gracefully on invalid input', () => {
    expect(defaultMeetingTitle(new Date('not-a-date'))).toBe('New meeting');
  });
});

describe('looksLikeAutoTitle', () => {
  it('detects the legacy "Untitled meeting" string', () => {
    expect(looksLikeAutoTitle('Untitled meeting')).toBe(true);
  });

  it('detects timestamp-format defaults', () => {
    expect(looksLikeAutoTitle('Tue May 12 · 14:30')).toBe(true);
    expect(looksLikeAutoTitle('Thu Jan 1 · 09:05')).toBe(true);
  });

  it('treats user-typed titles as locked-in', () => {
    expect(looksLikeAutoTitle('Q3 pricing review')).toBe(false);
    expect(looksLikeAutoTitle('1:1 with Sarah')).toBe(false);
    expect(looksLikeAutoTitle('Customer Discovery — Acme')).toBe(false);
  });

  it('treats empty input as auto', () => {
    expect(looksLikeAutoTitle('')).toBe(true);
  });
});
