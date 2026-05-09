import { parseRecipe, type ParsedRecipe } from './parse.js';

const modules = import.meta.glob('./*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const builtInRecipes: ParsedRecipe[] = Object.values(modules).map(parseRecipe);
