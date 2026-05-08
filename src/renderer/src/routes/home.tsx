import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Sparkles } from 'lucide-react';
import type { Meeting } from '@shared/types.js';
import { formatRelative } from '../lib/date';

export function HomeRoute() {
  const nav = useNavigate();
  const location = useLocation();
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  useEffect(() => {
    let alive = true;
    window.quill.meetings.list().then((list) => {
      if (alive) setMeetings(list);
    });
    return () => {
      alive = false;
    };
  }, [location.pathname, location.key]);

  const start = async () => {
    const m = await window.quill.meetings.create('Untitled meeting');
    nav(`/meeting/${m.id}`);
  };

  return (
    <div className="relative h-full overflow-y-auto pt-12">
      <div className="mx-auto max-w-3xl px-10 py-8">
        <header className="mb-10">
          <div className="text-xs uppercase tracking-[0.18em] text-ink-soft mb-2">
            Quill — open notebook
          </div>
          <h1
            className="font-serif text-[clamp(2.25rem,1.4rem+2.4vw,3.25rem)] leading-tight tracking-tight"
            style={{ letterSpacing: '-0.024em' }}
          >
            Note every meeting.<br />
            Polish it later.
          </h1>
          <p className="mt-4 max-w-prose text-ink-muted leading-relaxed">
            Quill listens to your computer's audio and your microphone, transcribes the
            conversation, and turns your rough notes into a clean writeup using a
            template you choose.
          </p>
          <div className="mt-7 flex items-center gap-3">
            <button
              onClick={start}
              className="btn btn-primary"
              data-testid="start-new-meeting"
            >
              <Plus size={14} strokeWidth={2.2} /> Start a meeting
            </button>
            <button
              onClick={() => nav('/templates')}
              className="btn btn-ghost"
            >
              <Sparkles size={14} /> Browse templates
            </button>
          </div>
        </header>

        <section className="mt-10">
          <h2 className="text-[11px] uppercase tracking-wider text-ink-soft mb-3">
            Recent meetings
          </h2>
          {meetings.length === 0 ? (
            <div className="card grain relative px-6 py-10 text-center">
              <div className="text-ink-muted">
                Your first meeting will land here.
              </div>
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {meetings.slice(0, 12).map((m) => (
                <li
                  key={m.id}
                  className="card no-drag cursor-pointer p-4 transition-colors hover:bg-surface-2"
                  onClick={() => nav(`/meeting/${m.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {m.title || 'Untitled'}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-soft">
                        {formatRelative(m.startedAt)}
                      </div>
                    </div>
                    {m.enhancedNotes && (
                      <span className="rounded-full px-2 py-0.5 text-[10px]"
                            style={{
                              background: 'oklch(var(--moss) / 0.15)',
                              color: 'oklch(var(--moss))',
                            }}>
                        enhanced
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
