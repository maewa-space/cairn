import { describe, it, expect } from 'vitest';
import { isHallucination } from '../../src/shared/hallucination.js';

describe('isHallucination', () => {
  it('catches the long compound YouTube outro Whisper invents on silence', () => {
    // The exact bug from 2026-05-08: silent mic produced this whole phrase
    // and the old end-anchored regex missed it.
    expect(
      isHallucination(
        "Thank you for watching and please don't forget to like, comment, share and subscribe to my channel.",
      ),
    ).toBe(true);
  });

  it('catches short YouTube outros', () => {
    expect(isHallucination('Thanks for watching!')).toBe(true);
    expect(isHallucination('Thank you for watching.')).toBe(true);
    expect(isHallucination('Thanks for joining me.')).toBe(true);
    expect(isHallucination('Subscribe to my channel for more')).toBe(true);
    expect(isHallucination("Please don't forget to like and subscribe!")).toBe(true);
    expect(isHallucination('See you in the next video!')).toBe(true);
  });

  it('catches non-English silent-input hallucinations', () => {
    expect(isHallucination('Det går.')).toBe(true);
    expect(isHallucination('Så är det.')).toBe(true);
    expect(isHallucination('Así es.')).toBe(true);
    expect(isHallucination('Ничего.')).toBe(true);
    expect(isHallucination('Продолжение следует...')).toBe(true);
  });

  it('catches filler tokens and bracketed sound markers', () => {
    expect(isHallucination('uh')).toBe(true);
    expect(isHallucination('Hmm.')).toBe(true);
    expect(isHallucination('[music]')).toBe(true);
    expect(isHallucination('[applause]')).toBe(true);
    expect(isHallucination('You.')).toBe(true);
    expect(isHallucination('Bye.')).toBe(true);
  });

  it('catches standalone "Thank you." — Whisper\'s most common silent hallucination', () => {
    // From the 2026-05-08 user report: "You · 00:10  Thank you." appeared
    // multiple times across a fully-silent 90s recording.
    expect(isHallucination('Thank you.')).toBe(true);
    expect(isHallucination('Thank you')).toBe(true);
    expect(isHallucination('THANK YOU!')).toBe(true);
    expect(isHallucination('Thanks.')).toBe(true);
    expect(isHallucination('Thanks!')).toBe(true);
    // But "Thank you for the report" should still pass through as real content.
    expect(isHallucination('Thank you for the detailed report.')).toBe(false);
    expect(isHallucination('Thanks Bob, that helps.')).toBe(false);
  });

  it('catches emoji-only and single-character spam', () => {
    expect(isHallucination('🎵🎵🎵')).toBe(true);
    expect(isHallucination('aaaaaa')).toBe(true);
  });

  it('drops chunks shorter than 3 characters', () => {
    expect(isHallucination('  ')).toBe(true);
    expect(isHallucination('a')).toBe(true);
    expect(isHallucination('hi')).toBe(true);
  });

  it('lets real meeting content through', () => {
    expect(
      isHallucination("Let's start by reviewing last week's metrics."),
    ).toBe(false);
    expect(
      isHallucination('I want to walk through the architecture changes.'),
    ).toBe(false);
    expect(isHallucination('The deploy is scheduled for Thursday.')).toBe(false);
    // Substring "subscribe" inside a real sentence should not trigger —
    // patterns are start-anchored where they need to be.
    expect(
      isHallucination('We should subscribe the new service to the queue.'),
    ).toBe(false);
  });
});
