import type { RecipeScope } from '../types.js';

export interface ParsedRecipe {
  id: string;
  name: string;
  trigger: string;
  description: string;
  scope: RecipeScope;
  prompt: string;
}

export function parseRecipe(raw: string): ParsedRecipe {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    throw new Error('Recipe missing front-matter');
  }
  const fm = Object.fromEntries(
    fmMatch[1]
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf(':');
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
      }),
  );
  const prompt = fmMatch[2].trim();

  if (!fm.id || !fm.name || !fm.trigger || !fm.scope) {
    throw new Error(`Recipe ${fm.id ?? '<unknown>'} missing required field`);
  }
  if (fm.scope !== 'meeting' && fm.scope !== 'global') {
    throw new Error(`Recipe ${fm.id} has invalid scope: ${fm.scope}`);
  }
  if (!/^[a-z0-9-]+$/.test(fm.trigger)) {
    throw new Error(`Recipe ${fm.id} trigger must be kebab-case alphanum: ${fm.trigger}`);
  }
  if (prompt.length < 10) {
    throw new Error(`Recipe ${fm.id} prompt is too short`);
  }

  return {
    id: fm.id,
    name: fm.name,
    trigger: fm.trigger,
    description: fm.description ?? '',
    scope: fm.scope as RecipeScope,
    prompt,
  };
}

const TRIGGER_RE = /(?:^|\s)\/([a-z0-9-]+)\b/;

export function detectTrigger(text: string): string | null {
  const m = text.match(TRIGGER_RE);
  return m ? m[1] : null;
}

export function stripTrigger(text: string, trigger: string): string {
  const re = new RegExp(`(^|\\s)\\/${trigger}\\b`, 'i');
  return text.replace(re, (_match, lead: string) => lead).trim();
}
