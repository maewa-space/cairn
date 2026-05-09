import { useMemo } from 'react';
import { renderMarkdown } from '../../lib/markdown';

export function EnhancedView({ markdown }: { markdown: string }) {
  const html = useMemo(() => renderMarkdown(markdown), [markdown]);
  return (
    <div
      // The --enhanced modifier opts in to the drop-cap rule defined in
      // global.css. Raw notes use plain .editor-prose so they don't get
      // dropcapped (they often start mid-thought).
      className="editor-prose editor-prose--enhanced px-1 py-2 max-w-none"
      data-testid="enhanced-view"
      // Local-only HTML produced by renderMarkdown — escapes raw input first.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
