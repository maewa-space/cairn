import { useMemo } from 'react';
import { renderMarkdown } from '../../lib/markdown';

export function EnhancedView({ markdown }: { markdown: string }) {
  const html = useMemo(() => renderMarkdown(markdown), [markdown]);
  return (
    <div
      className="editor-prose px-1 py-2 max-w-none"
      data-testid="enhanced-view"
      // Local-only HTML produced by renderMarkdown — escapes raw input first.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
