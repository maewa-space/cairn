// Composes a meeting's title + enhanced markdown + raw notes into a single
// markdown document. Shared between the .md export path and the PDF generator
// so both render an identical document structure.
//
// Raw notes are expected as plain text (already stripped from Tiptap HTML).

export interface ComposeMeetingMarkdownOptions {
  meetingTitle: string;
  enhancedMarkdown: string | null;
  rawNotesText: string;
}

export function composeMeetingMarkdown({
  meetingTitle,
  enhancedMarkdown,
  rawNotesText,
}: ComposeMeetingMarkdownOptions): string {
  const parts: string[] = [`# ${meetingTitle}`, ''];
  if (enhancedMarkdown) {
    parts.push(enhancedMarkdown, '');
  }
  const raw = rawNotesText.trim();
  if (raw) {
    parts.push('---', '## Raw notes', '', raw);
  }
  return parts.join('\n');
}
