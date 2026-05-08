import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Plus, Feather, Settings, FileText, Search } from 'lucide-react';
import type { Meeting } from '@shared/types.js';
import { formatRelative } from '../lib/date';

export function Sidebar() {
  const nav = useNavigate();
  const location = useLocation();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [query, setQuery] = useState('');

  const refresh = async () => {
    const list = query.trim()
      ? await window.quill.meetings.search(query.trim())
      : await window.quill.meetings.list();
    setMeetings(list);
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, location.pathname]);

  const newMeeting = async () => {
    const m = await window.quill.meetings.create('Untitled meeting');
    nav(`/meeting/${m.id}`);
  };

  return (
    <aside className="surface-2 flex flex-col border-r hairline">
      <div className="titlebar-drag h-9" />
      <div className="flex items-center gap-2 px-4 pt-1 pb-3">
        <Feather size={17} className="text-moss" strokeWidth={1.6} />
        <span className="font-serif text-lg tracking-tight">Quill</span>
      </div>

      <button
        onClick={newMeeting}
        className="no-drag mx-3 mb-3 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors"
        style={{
          background: 'oklch(var(--ink))',
          color: 'oklch(var(--surface))',
        }}
      >
        <Plus size={14} strokeWidth={2.2} />
        New meeting
      </button>

      <div className="relative px-3 mb-3 no-drag">
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

      <div className="px-3 pb-2 text-[11px] uppercase tracking-wider text-ink-soft">
        Recent
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-2">
        {meetings.length === 0 && (
          <div className="px-2 py-6 text-center text-sm text-ink-soft">
            No meetings yet.
            <br />
            <span className="text-xs">Hit "New meeting" to start.</span>
          </div>
        )}
        {meetings.map((m) => (
          <NavLink
            key={m.id}
            to={`/meeting/${m.id}`}
            className={({ isActive }) =>
              `no-drag block rounded-md px-3 py-2 text-sm leading-tight transition-colors ${
                isActive
                  ? 'bg-surface-3 text-ink'
                  : 'text-ink-muted hover:bg-surface-3 hover:text-ink'
              }`
            }
          >
            <div className="truncate">{m.title || 'Untitled meeting'}</div>
            <div className="text-[11px] text-ink-soft mt-0.5">
              {formatRelative(m.startedAt)}
              {m.enhancedNotes ? ' · enhanced' : m.endedAt ? ' · ended' : ''}
            </div>
          </NavLink>
        ))}
      </div>

      <div className="border-t hairline px-2 py-2 flex gap-1">
        <NavLink
          to="/templates"
          className={({ isActive }) =>
            `no-drag flex-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
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
          className={({ isActive }) =>
            `no-drag flex-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
              isActive
                ? 'bg-surface-3 text-ink'
                : 'text-ink-muted hover:bg-surface-3 hover:text-ink'
            }`
          }
        >
          <Settings size={13} /> Settings
        </NavLink>
      </div>
    </aside>
  );
}
