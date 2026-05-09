import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseRecipe, type ParsedRecipe } from './parse.js';

export function loadBuiltInRecipes(searchDir?: string): ParsedRecipe[] {
  const here = searchDir ?? dirname(fileURLToPath(import.meta.url));
  const files = readdirSync(here).filter((f) => f.endsWith('.md'));
  return files.map((name) => {
    const raw = readFileSync(join(here, name), 'utf-8');
    return parseRecipe(raw);
  });
}
