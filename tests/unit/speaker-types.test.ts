import { describe, it, expect } from 'vitest';
import {
  isDiarizedSpeaker,
  diarizedSpeakerIndex,
  type Speaker,
} from '../../src/shared/types.js';

describe('Speaker tag helpers', () => {
  it('identifies diarized labels', () => {
    expect(isDiarizedSpeaker('speaker-1' as Speaker)).toBe(true);
    expect(isDiarizedSpeaker('speaker-12' as Speaker)).toBe(true);
    expect(isDiarizedSpeaker('mic')).toBe(false);
    expect(isDiarizedSpeaker('system')).toBe(false);
  });

  it('extracts the 1-indexed speaker number from a diarized tag', () => {
    expect(diarizedSpeakerIndex('speaker-1' as Speaker)).toBe(1);
    expect(diarizedSpeakerIndex('speaker-2' as Speaker)).toBe(2);
    expect(diarizedSpeakerIndex('speaker-7' as Speaker)).toBe(7);
  });

  it('returns null for non-diarized tags', () => {
    expect(diarizedSpeakerIndex('mic')).toBeNull();
    expect(diarizedSpeakerIndex('system')).toBeNull();
  });
});
