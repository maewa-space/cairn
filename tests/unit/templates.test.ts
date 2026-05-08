import { describe, it, expect } from 'vitest';
import { parseTemplate } from '../../src/shared/templates/parse.js';
import { loadBuiltInTemplates } from '../../src/shared/templates/loader-node.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(here, '../../src/shared/templates');

describe('parseTemplate', () => {
  it('extracts id, name, description and splits system/output', () => {
    const raw = `---
id: demo
name: Demo
description: Demo template
---

# System

Be concise.

# Output structure

## Section A
`;
    const parsed = parseTemplate(raw);
    expect(parsed.id).toBe('demo');
    expect(parsed.name).toBe('Demo');
    expect(parsed.description).toBe('Demo template');
    expect(parsed.systemPrompt.trim()).toBe('Be concise.');
    expect(parsed.body).toContain('Section A');
  });

  it('throws when front-matter is missing', () => {
    expect(() => parseTemplate('# No front matter')).toThrow();
  });
});

describe('loadBuiltInTemplates', () => {
  it('loads all 6 built-in templates with required fields', () => {
    const templates = loadBuiltInTemplates(templatesDir);
    expect(templates.length).toBeGreaterThanOrEqual(6);
    const ids = templates.map((t) => t.id).sort();
    expect(ids).toEqual(
      [
        'customer-discovery',
        'generic',
        'one-on-one',
        'pitch',
        'standup',
        'user-interview',
      ].sort(),
    );
    for (const t of templates) {
      expect(t.systemPrompt.length).toBeGreaterThan(20);
      expect(t.body.length).toBeGreaterThan(20);
    }
  });
});
