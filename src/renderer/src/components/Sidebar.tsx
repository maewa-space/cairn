import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Plus,
  Settings,
  FileText,
  Search,
  MessageSquare,
  Menu,
  X,
  Home,
} from 'lucide-react';
import type { Meeting } from '@shared/types.js';
import { formatRelativeShort } from '../lib/date';
import { deriveIssue } from '../lib/issue';
import { FolderTree } from './sidebar/FolderTree';
import { QuillMark } from './ui/QuillMark';

type SidebarFilter = 'all' | 'unfiled' | string;

export type SidebarVariant = 'full' | 'compact' | 'mobile';

interface SidebarProps {
  variant?: SidebarVariant;
  /** Whether the compact/mobile overlay is currently open. */
  overlayOpen?: boolean;
  onOverlayOpen?: () => void;
  onOverlayClose?: () => void;
}

export function Sidebar({
  variant = 'full',
  overlayOpen = false,
  onOverlayOpen,
  onOverlayClose,
}: SidebarProps) {
  const nav = useNavigate();
  const location = useLocation();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SidebarFilter>('all');
  const [folderRefreshKey, setFolderRefreshKey] = useState(0);

  const refresh = async () => {
    const trimmed = query.trim();
    if (trimmed) {
      const list = await window.quill.meetings.search(trimmed);
      setMeetings(list);
      return;
    }
    if (filter === 'all') {
      setMeetings(await window.quill.meetings.list());
      return;
    }
    if (filter === 'unfiled') {
      setMeetings(await window.quill.meetings.listUnfiled());
      return;
    }
    setMeetings(await window.quill.meetings.listInFolder(filter));
  };

  useEffect(() => {
    refresh();
    // Subscribe to main-process broadcasts instead of polling. Sidebar
    // re-fetches only when meetings actually change, which kills the prior
    // "list flickers every 4 seconds" feel.
    const unsubMeetings = window.quill.events.onMeetingsChanged(() => {
      refresh();
    });
    const unsubFolders = window.quill.events.onFoldersChanged(() => {
      setFolderRefreshKey((k) => k + 1);
      refresh();
    });
    return () => {
      unsubMeetings();
      unsubFolders();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, location.pathname, filter]);

  const newMeeting = async () => {
    // Auto-title from the active calendar event (±10 min window) when one
    // matches, otherwise fall back to "Untitled meeting".
    const m = await window.quill.meetings.createWithCalendar('Untitled meeting');
    if (filter !== 'all' && filter !== 'unfiled') {
      await window.quill.meetings.moveToFolder(m.id, filter);
    }
    setFolderRefreshKey((k) => k + 1);
    onOverlayClose?.();
    nav(`/meeting/${m.id}`);
  };

  // Compact / mobile: render only an icon column. The full content opens as
  // an overlay drawer when the user taps the menu icon.
  if (variant === 'compact' || variant === 'mobile') {
    return (
      <>
        <CompactRail
          variant={variant}
          overlayOpen={overlayOpen}
          onOverlayOpen={onOverlayOpen}
          onOverlayClose={onOverlayClose}
          onNewMeeting={newMeeting}
        />
        {overlayOpen && (
          <div
            className="fixed inset-0 z-40 flex"
            role="dialog"
            aria-label="Sidebar drawer"
          >
            <button
              type="button"
              aria-label="Close sidebar"
              className="flex-1 bg-ink/30 backdrop-blur-[1px]"
              onClick={onOverlayClose}
            />
            <aside
              className="surface-2 flex h-full min-h-0 w-[280px] max-w-[88vw] flex-col overflow-hidden border-l hairline shadow-xl"
              style={{ animation: 'fade-up 0.18s var(--ease-out-soft) both' }}
            >
              <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 shrink-0">
                <div className="flex items-center gap-2">
                  <QuillMark size={20} />
                  <span className="font-serif text-lg tracking-tight">Quill</span>
                </div>
                <button
                  className="btn btn-ghost px-2 py-1"
                  onClick={onOverlayClose}
                  aria-label="Close sidebar"
                >
                  <X size={16} />
                </button>
              </div>
              <SidebarBody
                meetings={meetings}
                query={query}
                setQuery={setQuery}
                filter={filter}
                setFilter={setFilter}
                folderRefreshKey={folderRefreshKey}
                onNewMeeting={newMeeting}
                onCloseDrawer={onOverlayClose}
              />
            </aside>
          </div>
        )}
      </>
    );
  }

  return (
    // h-full + min-h-0 + overflow-hidden bound the aside to its grid row
    // height (100vh from Shell). Without this, CSS grid's default
    // min-height:auto lets the sidebar grow to its content height — which
    // pushes the body taller than the viewport (window scrollbar appears)
    // AND scrolls the titlebar-drag region away (so the macOS traffic
    // lights end up overlapping the meeting list). The flex-1 overflow-y
    // on the meeting list inside SidebarBody handles the actual scroll.
    <aside className="surface-2 flex h-full min-h-0 flex-col overflow-hidden border-r hairline">
      <div className="titlebar-drag h-9 shrink-0" />
      <div className="flex items-center gap-2 px-4 pt-1 pb-3 shrink-0">
        <QuillMark size={20} />
        <span className="font-serif text-lg tracking-tight">Quill</span>
      </div>

      <SidebarBody
        meetings={meetings}
        query={query}
        setQuery={setQuery}
        filter={filter}
        setFilter={setFilter}
        folderRefreshKey={folderRefreshKey}
        onNewMeeting={newMeeting}
      />
    </aside>
  );
}

interface CompactRailProps {
  variant: 'compact' | 'mobile';
  overlayOpen: boolean;
  onOverlayOpen?: () => void;
  onOverlayClose?: () => void;
  onNewMeeting: () => void;
}

function CompactRail({
  variant,
  overlayOpen,
  onOverlayOpen,
  onNewMeeting,
}: CompactRailProps) {
  const isMobile = variant === 'mobile';
  return (
    <aside
      className={
        isMobile
          ? 'surface-2 flex h-12 w-full items-center gap-1 border-t hairline px-3'
          : 'surface-2 flex flex-col items-center gap-2 border-r hairline py-2'
      }
    >
      {!isMobile && <div className="titlebar-drag h-7 w-full" />}
      <button
        onClick={() => (overlayOpen ? null : onOverlayOpen?.())}
        className="no-drag flex items-center justify-center rounded-md p-2 text-ink-muted hover:bg-surface-3 hover:text-ink"
        aria-label="Open sidebar"
        data-testid="sidebar-toggle"
      >
        <Menu size={17} />
      </button>
      <button
        onClick={onNewMeeting}
        className="no-drag flex items-center justify-center rounded-md p-2"
        aria-label="New meeting"
        title="New meeting"
        style={{
          background: 'oklch(var(--ink))',
          color: 'oklch(var(--surface))',
        }}
      >
        <Plus size={15} strokeWidth={2.2} />
      </button>
      {!isMobile && <div className="my-1 h-px w-6 bg-edge opacity-60" />}
      <RailIcon to="/home" label="Home" icon={<Home size={15} />} />
      <RailIcon to="/chat" label="Chat" icon={<MessageSquare size={15} />} />
      <RailIcon to="/templates" label="Templates" icon={<FileText size={15} />} />
      <RailIcon to="/settings" label="Settings" icon={<Settings size={15} />} />
    </aside>
  );
}

function RailIcon({
  to,
  label,
  icon,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      title={label}
      aria-label={label}
      className={({ isActive }) =>
        `no-drag flex items-center justify-center rounded-md p-2 transition-colors ${
          isActive
            ? 'bg-surface-3 text-ink'
            : 'text-ink-muted hover:bg-surface-3 hover:text-ink'
        }`
      }
    >
      {icon}
    </NavLink>
  );
}

interface SidebarBodyProps {
  meetings: Meeting[];
  query: string;
  setQuery: (v: string) => void;
  filter: SidebarFilter;
  setFilter: (v: SidebarFilter) => void;
  folderRefreshKey: number;
  onNewMeeting: () => void;
  onCloseDrawer?: () => void;
}

function SidebarBody({
  meetings,
  query,
  setQuery,
  filter,
  setFilter,
  folderRefreshKey,
  onNewMeeting,
  onCloseDrawer,
}: SidebarBodyProps) {
  return (
    <>
      <button
        onClick={onNewMeeting}
        className="no-drag shrink-0 mx-3 mb-3 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors"
        style={{
          background: 'oklch(var(--ink))',
          color: 'oklch(var(--surface))',
        }}
      >
        <Plus size={14} strokeWidth={2.2} />
        New meeting
      </button>

      <div className="relative px-3 mb-3 shrink-0 no-drag">
        <Search
          size={13}
          className="absolute left-5 top-1/2 -translate-y-1/2 text-ink-soft"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search meetings…"
          className="w-full rounded-md border bg-transparent pl-7 pr-2 py-1.5 text-sm placeholder:text-ink-soft focus:outline-none focus:ring-2"
          style={{
            borderColor: 'oklch(var(--edge))',
            ['--tw-ring-color' as string]: 'oklch(var(--accent) / 0.3)',
          }}
        />
      </div>

      <div className="shrink-0 no-drag">
        <FolderTree
          selectedFolderId={filter}
          onSelect={(next) => {
            if (next === null || next === 'all') setFilter('all');
            else setFilter(next);
          }}
          refreshKey={folderRefreshKey}
        />
      </div>

      <div className="shrink-0 px-3 pt-3 pb-2 eyebrow">
        {filter === 'all'
          ? 'Recent'
          : filter === 'unfiled'
            ? 'Unfiled'
            : 'In folder'}
      </div>

      {/* Compact single-line rows + always-on scrollbar (overflow-y: scroll
          rather than auto reserves the gutter so the layout doesn't shift
          when items appear/disappear, and the scrollbar is visible even
          when macOS hides it system-wide). flex-1 + min-h-0 lets the area
          stretch to fill the remaining sidebar space, and the bottom
          nav-row + Vol/Issue counter stay anchored. */}
      <div className="scroll-thin flex-1 min-h-0 overflow-y-scroll px-2 pb-2">
        {meetings.length === 0 && (
          <div className="px-3 py-6">
            <p className="microcopy text-sm leading-relaxed">
              {filter === 'all'
                ? 'An empty shelf — for now.'
                : 'Nothing here yet.'}
            </p>
          </div>
        )}
        {meetings.map((m) => (
          <NavLink
            key={m.id}
            to={`/meeting/${m.id}`}
            onClick={onCloseDrawer}
            className={({ isActive }) =>
              `no-drag flex items-baseline justify-between gap-2 py-1.5 pl-3 pr-2 text-[13px] leading-tight transition-colors border-l-[3px] ${
                isActive
                  ? 'border-moss text-ink font-medium bg-surface-3/40'
                  : 'border-transparent text-ink-muted hover:bg-surface-3 hover:text-ink'
              }`
            }
            title={m.title || 'Untitled meeting'}
          >
            <span className="truncate flex-1 min-w-0">
              {m.title || 'Untitled meeting'}
            </span>
            <span className="text-[10.5px] text-ink-soft shrink-0 font-mono tracking-tight">
              {formatRelativeShort(m.startedAt)}
            </span>
          </NavLink>
        ))}
      </div>

      <div className="shrink-0 border-t hairline px-2 py-2 flex flex-wrap gap-1">
        <NavLink
          to="/chat"
          onClick={onCloseDrawer}
          className={({ isActive }) =>
            `no-drag flex-1 min-w-[72px] flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
              isActive
                ? 'bg-surface-3 text-ink'
                : 'text-ink-muted hover:bg-surface-3 hover:text-ink'
            }`
          }
        >
          <MessageSquare size={13} /> Chat
        </NavLink>
        <NavLink
          to="/templates"
          onClick={onCloseDrawer}
          className={({ isActive }) =>
            `no-drag flex-1 min-w-[72px] flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
              isActive
                ? 'bg-surface-3 text-ink'
                : 'text-ink-muted hover:bg-surface-3 hover:text-ink'
            }`
          }
        >
          <FileText size={13} /> Templates
        </NavLink>
        <NavLink
          to="/settings"
          onClick={onCloseDrawer}
          className={({ isActive }) =>
            `no-drag flex-1 min-w-[72px] flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
              isActive
                ? 'bg-surface-3 text-ink'
                : 'text-ink-muted hover:bg-surface-3 hover:text-ink'
            }`
          }
        >
          <Settings size={13} /> Settings
        </NavLink>
      </div>
      {/* Editorial running counter — adds quiet delight at the foot of
          the sidebar, derived from total meeting count. */}
      <div className="shrink-0 px-3 pt-1 pb-2 text-center">
        <span className="microcopy text-[11px]">
          {deriveIssue(meetings.length || 1).combined}
        </span>
      </div>
    </>
  );
}
