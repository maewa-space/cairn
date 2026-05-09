import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  FolderPlus,
  MessageSquare,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { Folder, FolderColor } from '@shared/types.js';

interface FolderTreeProps {
  selectedFolderId: string | null | 'unfiled' | 'all';
  onSelect: (id: string | null | 'unfiled' | 'all') => void;
  refreshKey: number;
}

// Folder color picker swatches. Distinct labels — not the brand mark — but
// the green-family ones (moss, sage) share the brand hue 158 so they read
// as the same green family as the rest of the app rather than two different
// greens fighting each other.
const COLOR_STYLES: Record<NonNullable<FolderColor>, string> = {
  moss: 'oklch(var(--moss))',
  sage: 'oklch(72% 0.06 158)',
  amber: 'oklch(72% 0.13 75)',
  stone: 'oklch(60% 0.01 80)',
};

export function FolderTree({
  selectedFolderId,
  onSelect,
  refreshKey,
}: FolderTreeProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  const refresh = async () => {
    const list = await window.quill.folders.list();
    setFolders(list);
  };

  useEffect(() => {
    refresh();
    // Listen for folder mutations from any window so this view stays
    // current without polling.
    const unsub = window.quill.events.onFoldersChanged(() => {
      refresh();
    });
    return () => unsub();
  }, [refreshKey]);

  useEffect(() => {
    if (creating || renamingId) inputRef.current?.focus();
  }, [creating, renamingId]);

  const startCreate = () => {
    setCreating(true);
    setDraft('');
    setRenamingId(null);
    setExpanded(true);
  };

  const submitCreate = async () => {
    const name = draft.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    await window.quill.folders.create(name, null);
    setCreating(false);
    setDraft('');
    await refresh();
  };

  const startRename = (folder: Folder) => {
    setRenamingId(folder.id);
    setDraft(folder.name);
  };

  const submitRename = async () => {
    if (!renamingId) return;
    const name = draft.trim();
    if (name) await window.quill.folders.rename(renamingId, name);
    setRenamingId(null);
    setDraft('');
    await refresh();
  };

  const remove = async (folder: Folder) => {
    if (
      !window.confirm(
        `Delete folder "${folder.name}"? Meetings inside will become unfiled.`,
      )
    ) {
      return;
    }
    await window.quill.folders.delete(folder.id);
    if (selectedFolderId === folder.id) onSelect('all');
    await refresh();
  };

  const cycleColor = async (folder: Folder) => {
    const order: FolderColor[] = [null, 'moss', 'sage', 'amber', 'stone'];
    const idx = order.indexOf(folder.color);
    const next = order[(idx + 1) % order.length];
    await window.quill.folders.setColor(folder.id, next);
    await refresh();
  };

  return (
    <div className="px-2 pb-1" data-testid="folder-tree">
      <div className="flex items-center justify-between px-1 pb-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse folders' : 'Expand folders'}
          className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-ink-soft hover:text-ink"
        >
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          Folders
        </button>
        <button
          type="button"
          onClick={startCreate}
          aria-label="New folder"
          className="text-ink-soft hover:text-ink"
          data-testid="folder-new"
        >
          <FolderPlus size={12} />
        </button>
      </div>

      {expanded && (
        <div className="space-y-0.5">
          <PseudoRow
            label="All meetings"
            active={selectedFolderId === 'all'}
            onClick={() => onSelect('all')}
          />
          <PseudoRow
            label="Unfiled"
            active={selectedFolderId === 'unfiled'}
            onClick={() => onSelect('unfiled')}
          />
          {folders.map((f) => {
            const isRenaming = renamingId === f.id;
            const active = selectedFolderId === f.id;
            return (
              <div key={f.id} className="group relative">
                {isRenaming ? (
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={submitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitRename();
                      if (e.key === 'Escape') {
                        setRenamingId(null);
                        setDraft('');
                      }
                    }}
                    className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm focus:outline-none"
                    style={{ borderColor: 'oklch(var(--edge))' }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(f.id)}
                    onDoubleClick={() => startRename(f)}
                    data-testid={`folder-row-${f.id}`}
                    data-active={active}
                    className={`flex w-full items-center gap-2 py-1.5 pl-2 pr-2 text-sm transition-colors border-l-[3px] -ml-2 ${
                      active
                        ? 'border-moss text-ink font-medium bg-surface-3/40'
                        : 'border-transparent text-ink-muted hover:bg-surface-3 hover:text-ink'
                    }`}
                  >
                    <FolderIcon size={12} className="shrink-0 opacity-70" />
                    {f.color && (
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ background: COLOR_STYLES[f.color] }}
                      />
                    )}
                    <span className="truncate flex-1 text-left">{f.name}</span>
                    <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex items-center gap-0.5 transition-opacity">
                      <IconBtn
                        ariaLabel={`Open chat for folder ${f.name}`}
                        title="Folder chat"
                        onClick={(e) => {
                          e.stopPropagation();
                          nav(`/chat?folder=${f.id}`);
                        }}
                      >
                        <MessageSquare size={11} />
                      </IconBtn>
                      <IconBtn
                        ariaLabel={`Cycle color for folder ${f.name}`}
                        title="Cycle color"
                        onClick={(e) => {
                          e.stopPropagation();
                          cycleColor(f);
                        }}
                      >
                        <span
                          aria-hidden
                          className="block h-2 w-2 rounded-full"
                          style={{
                            background: f.color
                              ? COLOR_STYLES[f.color]
                              : 'oklch(var(--edge))',
                          }}
                        />
                      </IconBtn>
                      <IconBtn
                        ariaLabel={`Rename folder ${f.name}`}
                        title="Rename"
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(f);
                        }}
                      >
                        <Pencil size={11} />
                      </IconBtn>
                      <IconBtn
                        ariaLabel={`Delete folder ${f.name}`}
                        title="Delete folder"
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(f);
                        }}
                      >
                        <Trash2 size={11} />
                      </IconBtn>
                    </span>
                  </button>
                )}
              </div>
            );
          })}
          {creating && (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={submitCreate}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCreate();
                if (e.key === 'Escape') {
                  setCreating(false);
                  setDraft('');
                }
              }}
              placeholder="New folder name…"
              className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm focus:outline-none"
              style={{ borderColor: 'oklch(var(--edge))' }}
              data-testid="folder-name-input"
            />
          )}
        </div>
      )}
    </div>
  );
}

function PseudoRow({
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
      onClick={onClick}
      data-active={active}
      className={`flex w-full items-center gap-2 py-1.5 pl-2 pr-2 text-sm transition-colors border-l-[3px] -ml-2 ${
        active
          ? 'border-moss text-ink font-medium bg-surface-3/40'
          : 'border-transparent text-ink-muted hover:bg-surface-3 hover:text-ink'
      }`}
    >
      <FolderIcon size={12} className="opacity-40" />
      <span>{label}</span>
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      className="rounded p-0.5 hover:bg-surface-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2"
      style={{ ['--tw-ring-color' as string]: 'oklch(var(--accent) / 0.4)' }}
    >
      {children}
    </button>
  );
}
