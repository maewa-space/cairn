import { parseTemplate, type ParsedTemplate } from './parse.js';

const modules = import.meta.glob('./*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const builtInTemplates: ParsedTemplate[] = Object.values(modules).map(parseTemplate);
