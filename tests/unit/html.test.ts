import { describe, it, expect } from 'vitest';
import { stripHtml } from '../../src/renderer/src/lib/html.js';

describe('stripHtml', () => {
  it('returns empty string for empty input', () => {
    expect(stripHtml('')).toBe('');
  });

  it('converts headings to markdown headings', () => {
    expect(stripHtml('<h1>Title</h1>')).toContain('# Title');
    expect(stripHtml('<h2>Sub</h2>')).toContain('## Sub');
    expect(stripHtml('<h3>Smaller</h3>')).toContain('### Smaller');
  });

  it('converts paragraphs and line breaks', () => {
    const out = stripHtml('<p>One.</p><p>Two.</p>');
    expect(out).toMatch(/One\./);
    expect(out).toMatch(/Two\./);
  });

  it('converts bullet lists', () => {
    const out = stripHtml('<ul><li>alpha</li><li>beta</li></ul>');
    expect(out).toContain('- alpha');
    expect(out).toContain('- beta');
  });

  it('preserves bold and italic markers', () => {
    expect(stripHtml('<p><strong>bold</strong> text</p>')).toContain('**bold**');
    expect(stripHtml('<p><em>italic</em> text</p>')).toContain('*italic*');
  });

  it('decodes common HTML entities', () => {
    expect(stripHtml('<p>five &amp; ten</p>')).toContain('five & ten');
    expect(stripHtml('<p>&quot;quoted&quot;</p>')).toContain('"quoted"');
  });

  it('collapses excess blank lines', () => {
    const out = stripHtml('<h1>a</h1><p></p><p></p><p>b</p>');
    expect(out).not.toMatch(/\n{3,}/);
  });
});
