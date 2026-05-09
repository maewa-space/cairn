import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseRecipe,
  detectTrigger,
  stripTrigger,
} from '../../src/shared/recipes/parse.js';
import { loadBuiltInRecipes } from '../../src/shared/recipes/loader-node.js';

const here = dirname(fileURLToPath(import.meta.url));
const recipesDir = join(here, '../../src/shared/recipes');

describe('parseRecipe', () => {
  it('extracts metadata and prompt body', () => {
    const raw = `---
id: demo
trigger: demo
name: Demo
description: A demo
scope: meeting
---

Be specific. Stay grounded in the transcript.`;
    const parsed = parseRecipe(raw);
    expect(parsed.id).toBe('demo');
    expect(parsed.trigger).toBe('demo');
    expect(parsed.scope).toBe('meeting');
    expect(parsed.prompt).toContain('grounded in the transcript');
  });

  it('rejects invalid scope', () => {
    const raw = `---
id: bad
trigger: bad
name: Bad
description: oops
scope: weird
---

x`;
    expect(() => parseRecipe(raw)).toThrow(/scope/);
  });

  it('rejects non-kebab triggers', () => {
    const raw = `---
id: bad
trigger: Bad Trigger
name: Bad
description: oops
scope: meeting
---

A long enough prompt.`;
    expect(() => parseRecipe(raw)).toThrow(/trigger/);
  });
});

describe('detectTrigger', () => {
  it('returns null when no slash command present', () => {
    expect(detectTrigger('plain message')).toBeNull();
  });

  it('returns the trigger when /name appears', () => {
    expect(detectTrigger('/coach what did I miss?')).toBe('coach');
    expect(detectTrigger('Hey /follow-up please')).toBe('follow-up');
  });

  it('ignores embedded slashes', () => {
    expect(detectTrigger('see foo/bar')).toBeNull();
  });
});

describe('stripTrigger', () => {
  it('removes the trigger and trims', () => {
    expect(stripTrigger('/coach what did I miss?', 'coach')).toBe(
      'what did I miss?',
    );
    expect(stripTrigger('Hey /follow-up please', 'follow-up')).toBe(
      'Hey  please',
    );
  });
});

describe('loadBuiltInRecipes', () => {
  it('loads all 6 built-in recipes with correct triggers and scopes', () => {
    const recipes = loadBuiltInRecipes(recipesDir);
    const triggers = recipes.map((r) => r.trigger).sort();
    expect(triggers).toEqual(
      [
        'action-items',
        'coach',
        'decisions',
        'follow-up',
        'objections',
        'prep',
      ].sort(),
    );
    const prep = recipes.find((r) => r.trigger === 'prep');
    expect(prep?.scope).toBe('global');
    const coach = recipes.find((r) => r.trigger === 'coach');
    expect(coach?.scope).toBe('meeting');
    for (const r of recipes) {
      expect(r.prompt.length).toBeGreaterThan(20);
      expect(r.name.length).toBeGreaterThan(0);
    }
  });
});
