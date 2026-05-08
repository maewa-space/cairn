import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/renderer/src/lib/markdown.js';

describe('renderMarkdown', () => {
  it('renders headings and paragraphs', () => {
    const html = renderMarkdown('# Title\n\nBody paragraph.');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<p>Body paragraph.</p>');
  });

  it('renders bullet and ordered lists', () => {
    const html = renderMarkdown('- one\n- two');
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
    const ol = renderMarkdown('1. first\n2. second');
    expect(ol).toContain('<ol><li>first</li><li>second</li></ol>');
  });

  it('renders todo items', () => {
    const html = renderMarkdown('- [ ] open\n- [x] done');
    expect(html).toContain('class="todo-list"');
    expect(html).toContain('<input type="checkbox" disabled> open');
    expect(html).toContain('<input type="checkbox" disabled checked> done');
  });

  it('escapes HTML in source', () => {
    const html = renderMarkdown('<script>x</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders inline bold/italic/code', () => {
    const html = renderMarkdown('**bold** _italic_ `code`');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code>code</code>');
  });
});
