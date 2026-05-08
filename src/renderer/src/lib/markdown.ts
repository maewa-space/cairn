// Tiny markdown → safe HTML converter for displaying enhanced notes inline.
// Intentionally limited: headings, paragraphs, bullet lists, todo lists, bold, italic, code.

export function renderMarkdown(md: string): string {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = escaped.split('\n');
  const out: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let inPara = false;

  const closePara = () => {
    if (inPara) {
      out.push('</p>');
      inPara = false;
    }
  };
  const closeList = () => {
    if (inList) {
      out.push(inList === 'ul' ? '</ul>' : '</ol>');
      inList = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    const todoMatch = line.match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/);
    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    const olMatch = line.match(/^\d+\.\s+(.*)$/);

    if (headingMatch) {
      closePara();
      closeList();
      const level = headingMatch[1].length;
      out.push(`<h${level}>${inline(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (todoMatch) {
      closePara();
      if (inList !== 'ul') {
        closeList();
        inList = 'ul';
        out.push('<ul class="todo-list">');
      }
      const checked = todoMatch[1].toLowerCase() === 'x';
      out.push(
        `<li class="todo"><input type="checkbox" disabled${checked ? ' checked' : ''}> ${inline(todoMatch[2])}</li>`,
      );
      continue;
    }

    if (ulMatch) {
      closePara();
      if (inList !== 'ul') {
        closeList();
        inList = 'ul';
        out.push('<ul>');
      }
      out.push(`<li>${inline(ulMatch[1])}</li>`);
      continue;
    }

    if (olMatch) {
      closePara();
      if (inList !== 'ol') {
        closeList();
        inList = 'ol';
        out.push('<ol>');
      }
      out.push(`<li>${inline(olMatch[1])}</li>`);
      continue;
    }

    if (line.trim() === '') {
      closePara();
      closeList();
      continue;
    }

    if (!inPara) {
      closeList();
      out.push('<p>');
      inPara = true;
    } else {
      out.push(' ');
    }
    out.push(inline(line));
  }

  closePara();
  closeList();
  return out.join('');
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
}
