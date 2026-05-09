import { describe, it, expect } from 'vitest';
import { parseIcs } from '../../src/shared/ics.js';

describe('parseIcs', () => {
  it('parses a simple VEVENT block', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:abc-123@example.com',
      'SUMMARY:Q3 customer interview',
      'DTSTART:20260508T140000Z',
      'DTEND:20260508T150000Z',
      'LOCATION:Zoom',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const events = parseIcs(ics);
    expect(events).toHaveLength(1);
    expect(events[0].uid).toBe('abc-123@example.com');
    expect(events[0].title).toBe('Q3 customer interview');
    expect(events[0].location).toBe('Zoom');
    expect(events[0].startsAt).toBe('2026-05-08T14:00:00.000Z');
    expect(events[0].endsAt).toBe('2026-05-08T15:00:00.000Z');
  });

  it('extracts attendees with CN display names and falls back to mailto', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:e1',
      'SUMMARY:Sync',
      'DTSTART:20260508T140000Z',
      'DTEND:20260508T150000Z',
      'ATTENDEE;CN="Alex Patel";ROLE=REQ-PARTICIPANT:mailto:alex@example.com',
      'ATTENDEE;ROLE=OPT-PARTICIPANT:mailto:bob@example.com',
      'ORGANIZER;CN=Charlie:mailto:charlie@example.com',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [event] = parseIcs(ics);
    expect(event.attendees).toEqual(['Alex Patel', 'bob@example.com', 'Charlie']);
  });

  it('unfolds long lines that wrap onto continuation lines', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:e1',
      'SUMMARY:A very long ti',
      ' tle that wraps acro',
      ' ss three lines',
      'DTSTART:20260508T140000Z',
      'DTEND:20260508T150000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [event] = parseIcs(ics);
    expect(event.title).toBe('A very long title that wraps across three lines');
  });

  it('handles all-day DATE-only events', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:e1',
      'SUMMARY:Holiday',
      'DTSTART;VALUE=DATE:20260508',
      'DTEND;VALUE=DATE:20260509',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [event] = parseIcs(ics);
    expect(event.startsAt).toBe('2026-05-08T00:00:00.000Z');
    expect(event.endsAt).toBe('2026-05-09T00:00:00.000Z');
  });

  it('skips VEVENTs missing required fields', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:Missing UID',
      'DTSTART:20260508T140000Z',
      'DTEND:20260508T150000Z',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:has-uid',
      'SUMMARY:Has UID',
      'DTSTART:20260508T160000Z',
      'DTEND:20260508T170000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const events = parseIcs(ics);
    expect(events).toHaveLength(1);
    expect(events[0].uid).toBe('has-uid');
  });

  it('unescapes \\n, \\,, \\; in description text', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:e1',
      'SUMMARY:Notes',
      'DTSTART:20260508T140000Z',
      'DTEND:20260508T150000Z',
      'DESCRIPTION:line one\\nline two\\, comma\\; semi',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [event] = parseIcs(ics);
    expect(event.description).toBe('line one\nline two, comma; semi');
  });
});
