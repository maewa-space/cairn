import { useEffect, useRef, useState } from 'react';
import {
  ChevronRight,
  Copy,
  Download,
  FileText,
  FolderInput,
  MoreHorizontal,
  Share2,
  Trash2,
} from 'lucide-react';
import type { Folder } from '@shared/types.js';
import { composeMeetingMarkdown } from '@shared/meeting-export.js';
import { stripHtml } from '../../lib/html';
import { MenuPanel } from '../ui/MenuPanel';

interface MeetingActionsProps {
  meetingTitle: string;
  meetingId: string;
  currentFolderId: string | null;
  folders: Folder[];
  rawNotesHtml: string;
  enhancedMarkdown: string | null;
  onDelete: () => void;
  onMoveToFolder: (folderId: string | null) => Promise<void> | void;
}

type Submenu = 'none' | 'folder' | 'export';

interface Banner {
  kind: 'error' | 'note';
  message: string;
}

export function MeetingActions({
  meetingTitle,
  meetingId,
  currentFolderId,
  folders,
  rawNotesHtml,
  enhancedMarkdown,
  onDelete,
  onMoveToFolder,
}: MeetingActionsProps) {
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<Submenu>('none');
  const [copied, setCopied] = useState<'raw' | 'enhanced' | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'md' | 'share' | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Outside click + Esc close.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSubmenu('none');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setSubmenu('none');
      }
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Auto-dismiss the post-export "EXPORTED · 14:09" ghost.
  useEffect(() => {
    if (!exportedAt) return;
    const t = window.setTimeout(() => setExportedAt(null), 4000);
    return () => window.clearTimeout(t);
  }, [exportedAt]);

  // Auto-dismiss the inline error banner.
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(null), 5000);
    return () => window.clearTimeout(t);
  }, [banner]);

  const composedMarkdown = (): string =>
    composeMeetingMarkdown({
      meetingTitle,
      enhancedMarkdown,
      rawNotesText: stripHtml(rawNotesHtml),
    });

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(composedMarkdown());
      setCopied('enhanced');
      setTimeout(() => setCopied(null), 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBanner({ kind: 'error', message: `Couldn't copy: ${msg}` });
    }
  };

  const copyEnhanced = async () => {
    if (!enhancedMarkdown) return;
    try {
      await navigator.clipboard.writeText(enhancedMarkdown);
      setCopied('enhanced');
      setTimeout(() => setCopied(null), 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBanner({ kind: 'error', message: `Couldn't copy: ${msg}` });
    }
  };

  const exportMarkdown = async () => {
    setBusy('md');
    try {
      const path = await window.quill.dialog.saveMarkdown({
        suggestedName: meetingTitle,
        content: composedMarkdown(),
      });
      if (path) {
        await window.quill.dialog.revealInFinder(path);
        setExportedAt(formatHHMM());
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[meeting-actions] markdown export failed:', err);
      setBanner({ kind: 'error', message: `Couldn't export markdown: ${msg}` });
    } finally {
      setBusy(null);
      setOpen(false);
      setSubmenu('none');
    }
  };

  const exportPdf = async () => {
    setBusy('pdf');
    try {
      const path = await window.quill.dialog.savePdf({
        meetingId,
        suggestedName: meetingTitle,
      });
      if (path) {
        await window.quill.dialog.revealInFinder(path);
        setExportedAt(formatHHMM());
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[meeting-actions] pdf export failed:', err);
      setBanner({ kind: 'error', message: `Couldn't export PDF: ${msg}` });
    } finally {
      setBusy(null);
      setOpen(false);
      setSubmenu('none');
    }
  };

  const sharePdf = async () => {
    setBusy('share');
    try {
      await window.quill.dialog.sharePdf({ meetingId });
      setExportedAt(formatHHMM());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[meeting-actions] share failed:', err);
      setBanner({ kind: 'error', message: `Couldn't share: ${msg}` });
    } finally {
      setBusy(null);
      setOpen(false);
      setSubmenu('none');
    }
  };

  const confirmDelete = () => {
    if (!window.confirm('Delete this meeting? This cannot be undone.')) return;
    onDelete();
    setOpen(false);
  };

  const toggleSubmenu = (next: Exclude<Submenu, 'none'>) =>
    setSubmenu((cur) => (cur === next ? 'none' : next));

  return (
    <div ref={ref} className="relative flex items-center gap-3">
      {exportedAt && (
        <span
          className="dateline whitespace-nowrap"
          style={{ color: 'oklch(var(--moss))' }}
          data-testid="export-confirmation"
          aria-live="polite"
        >
          EXPORTED · {exportedAt}
        </span>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost px-2"
        aria-label="Meeting actions"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="meeting-actions"
      >
        <MoreHorizontal size={16} />
      </button>
      {banner && (
        <div
          role="alert"
          className="absolute right-0 top-full mt-1 z-40 w-64 rounded-md border-l-2 border-l-accent bg-surface px-3 py-2 shadow-md"
          style={{ borderColor: 'oklch(var(--edge))', borderLeftColor: 'oklch(var(--accent))' }}
        >
          <p className="microcopy text-xs leading-relaxed">
            <span
              className="eyebrow mr-1.5"
              style={{ color: 'oklch(var(--accent))' }}
            >
              Hmm
            </span>
            {banner.message}
          </p>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="mt-1 text-[11px] text-ink-soft hover:text-ink underline"
          >
            Dismiss
          </button>
        </div>
      )}
      {open && (
        <MenuPanel
          ariaLabel="Meeting actions menu"
          className="absolute right-0 top-full mt-1 w-60 rounded-md border z-30 shadow-xl py-1"
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
            label="Export…"
            trailing={
              <ChevronRight
                size={13}
                className={`opacity-60 transition-transform ${
                  submenu === 'export' ? 'rotate-90' : ''
                }`}
              />
            }
            onClick={() => toggleSubmenu('export')}
            data-testid="export-submenu"
            aria-expanded={submenu === 'export'}
          />
          {submenu === 'export' && (
            <SubmenuShell>
              <SubButton
                onClick={exportPdf}
                disabled={busy === 'pdf'}
                testid="export-pdf"
                primary={busy === 'pdf' ? 'Rendering PDF…' : 'PDF (.pdf)'}
                secondary="Editorial layout, ready to print"
              />
              <SubButton
                onClick={exportMarkdown}
                disabled={busy === 'md'}
                testid="export-md"
                primary="Markdown (.md)"
                secondary="Plain text, paste anywhere"
              />
            </SubmenuShell>
          )}
          <MenuItem
            icon={<Share2 size={13} />}
            label={busy === 'share' ? 'Preparing PDF…' : 'Share…'}
            onClick={sharePdf}
            disabled={busy === 'share'}
            data-testid="share-pdf"
          />
          <div
            className="my-1 mx-2 border-t"
            style={{ borderColor: 'oklch(var(--edge))' }}
          />
          <MenuItem
            icon={<FolderInput size={13} />}
            label="Move to folder…"
            onClick={() => toggleSubmenu('folder')}
            data-testid="meeting-move-to-folder"
            aria-expanded={submenu === 'folder'}
            trailing={
              <ChevronRight
                size={13}
                className={`opacity-60 transition-transform ${
                  submenu === 'folder' ? 'rotate-90' : ''
                }`}
              />
            }
          />
          {submenu === 'folder' && (
            <SubmenuShell>
              <SubItem
                label="Unfiled"
                active={currentFolderId === null}
                onClick={async () => {
                  await onMoveToFolder(null);
                  setOpen(false);
                  setSubmenu('none');
                }}
              />
              {folders.length === 0 && (
                <div className="px-3 py-1.5 text-[11px] text-ink-soft microcopy">
                  No folders yet — create one in the sidebar.
                </div>
              )}
              {folders.map((f) => (
                <SubItem
                  key={f.id}
                  label={f.name}
                  active={currentFolderId === f.id}
                  onClick={async () => {
                    await onMoveToFolder(f.id);
                    setOpen(false);
                    setSubmenu('none');
                  }}
                />
              ))}
            </SubmenuShell>
          )}
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
        </MenuPanel>
      )}
    </div>
  );
}

function SubmenuShell({ children }: { children: React.ReactNode }) {
  // Subtle vertical-collapse on submenu mount so it reads as opening, not
  // popping. 120ms fade + max-height interpolation keeps the menu rhythm
  // tight. Reduced-motion guard collapses to ~0.
  return (
    <div
      className="px-1 pb-1"
      style={{
        animation: 'fade-up 0.16s var(--ease-out-soft) both',
      }}
    >
      {children}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  trailing,
  onClick,
  tone,
  disabled,
  ...rest
}: {
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  onClick: () => void;
  tone?: 'danger';
  disabled?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface-2 disabled:opacity-60 disabled:hover:bg-transparent ${
        tone === 'danger' ? 'text-accent' : ''
      }`}
      {...rest}
    >
      <span className="opacity-70">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}

function SubItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-left ${
        active ? 'bg-surface-3 text-ink' : 'hover:bg-surface-2 text-ink-muted'
      }`}
      data-testid={`folder-pick-${label}`}
    >
      {active && <span className="text-moss">·</span>}
      <span className="truncate">{label}</span>
    </button>
  );
}

function SubButton({
  primary,
  secondary,
  testid,
  onClick,
  disabled,
}: {
  primary: string;
  secondary: string;
  testid: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
      className="flex w-full items-start gap-2 rounded-md px-3 py-1.5 text-left hover:bg-surface-2 disabled:opacity-60 disabled:hover:bg-transparent"
    >
      <FileText size={13} className="mt-0.5 opacity-60 shrink-0" />
      <span className="flex flex-col leading-tight min-w-0">
        <span className="text-[13px] text-ink truncate">{primary}</span>
        <span className="text-[10.5px] text-ink-soft italic" style={{ fontFamily: 'var(--font-serif)' }}>
          {secondary}
        </span>
      </span>
    </button>
  );
}

function formatHHMM(d: Date = new Date()): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
