import { useEffect, useRef, useState } from 'react';
import { Copy, Download, MoreHorizontal, Trash2 } from 'lucide-react';
import { stripHtml } from '../../lib/html';

interface MeetingActionsProps {
  meetingTitle: string;
  rawNotesHtml: string;
  enhancedMarkdown: string | null;
  onDelete: () => void;
}

export function MeetingActions({
  meetingTitle,
  rawNotesHtml,
  enhancedMarkdown,
  onDelete,
}: MeetingActionsProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<'raw' | 'enhanced' | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const composedMarkdown = (): string => {
    const parts: string[] = [`# ${meetingTitle}`, ''];
    if (enhancedMarkdown) {
      parts.push(enhancedMarkdown, '');
    }
    const raw = stripHtml(rawNotesHtml).trim();
    if (raw) {
      parts.push('---', '## Raw notes', '', raw);
    }
    return parts.join('\n');
  };

  const copyAll = async () => {
    await navigator.clipboard.writeText(composedMarkdown());
    setCopied('enhanced');
    setTimeout(() => setCopied(null), 1200);
  };

  const copyEnhanced = async () => {
    if (!enhancedMarkdown) return;
    await navigator.clipboard.writeText(enhancedMarkdown);
    setCopied('enhanced');
    setTimeout(() => setCopied(null), 1200);
  };

  const exportFile = async () => {
    const path = await window.quill.dialog.saveMarkdown({
      suggestedName: meetingTitle,
      content: composedMarkdown(),
    });
    if (path) {
      await window.quill.dialog.revealInFinder(path);
    }
    setOpen(false);
  };

  const confirmDelete = () => {
    if (!window.confirm('Delete this meeting? This cannot be undone.')) return;
    onDelete();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost px-2"
        aria-label="Meeting actions"
        data-testid="meeting-actions"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-56 rounded-md border z-30 shadow-xl py-1"
          style={{
            background: 'oklch(var(--surface))',
            borderColor: 'oklch(var(--edge))',
          }}
        >
          <MenuItem
            icon={<Copy size={13} />}
            label={copied === 'enhanced' ? 'Copied!' : 'Copy as Markdown'}
            onClick={enhancedMarkdown ? copyEnhanced : copyAll}
          />
          <MenuItem
            icon={<Download size={13} />}
            label="Export to .md file…"
            onClick={exportFile}
          />
          <div
            className="my-1 mx-2 border-t"
            style={{ borderColor: 'oklch(var(--edge))' }}
          />
          <MenuItem
            icon={<Trash2 size={13} />}
            label="Delete meeting"
            onClick={confirmDelete}
            tone="danger"
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'danger';
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface-2 ${
        tone === 'danger' ? 'text-accent' : ''
      }`}
    >
      <span className="opacity-70">{icon}</span>
      {label}
    </button>
  );
}
