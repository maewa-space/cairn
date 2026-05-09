import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Sparkles } from 'lucide-react';
import { animate, inView, stagger } from 'motion';
import type { Meeting } from '@shared/types.js';
import { Masthead } from '../components/Masthead';
import { deriveIssue, formatIssueDate } from '../lib/issue';

const SHORT_WEEKDAY = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
const HHMM = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

function durationLabel(m: Meeting): string | null {
  if (!m.endedAt) return null;
  const start = new Date(m.startedAt).getTime();
  const end = new Date(m.endedAt).getTime();
  const minutes = Math.max(0, Math.round((end - start) / 60_000));
  if (minutes < 1) return '< 1 MIN';
  return `${minutes} MIN`;
}

function voicesLabel(m: Meeting): string | null {
  if (!m.transcript || m.transcript.length === 0) return null;
  const speakers = new Set(m.transcript.map((e) => e.speaker));
  return speakers.size === 1 ? '1 VOICE' : `${speakers.size} VOICES`;
}

export function HomeRoute() {
  const nav = useNavigate();
  const location = useLocation();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const listRef = useRef<HTMLOListElement>(null);
  // Track the *count* on first meaningful load so we only stagger-animate
  // when the list itself fades in, not on every nav refresh.
  const animatedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    window.quill.meetings.list().then((list) => {
      if (alive) setMeetings(list);
    });
    return () => {
      alive = false;
    };
  }, [location.pathname, location.key]);

  // Stagger fade-up the meeting rows on first arrival. Subsequent state
  // changes (e.g. background sidebar refresh) don't re-trigger because
  // `animatedRef` is sticky.
  useEffect(() => {
    if (animatedRef.current) return;
    if (!listRef.current) return;
    if (meetings.length === 0) return;
    animatedRef.current = true;
    inView(listRef.current, () => {
      const rows = listRef.current?.querySelectorAll('[data-issue-row]');
      if (!rows || rows.length === 0) return;
      animate(
        rows as unknown as Element[],
        { opacity: [0, 1], y: [6, 0] },
        { duration: 0.32, ease: 'easeOut', delay: stagger(0.04) },
      );
    });
  }, [meetings.length]);

  const start = async () => {
    // Auto-title from the active calendar event (±10 min window). Falls back
    // to a readable timestamp default ("Mon May 12 · 14:30") which Enhance
    // refines into a semantic title once notes have been polished.
    const m = await window.quill.meetings.createWithCalendar('');
    nav(`/meeting/${m.id}`);
  };

  const issue = deriveIssue(meetings.length || 1);
  const today = formatIssueDate();

  return (
    <div className="relative h-full overflow-y-auto pt-12">
      <div className="mx-auto max-w-3xl px-5 sm:px-10 py-8">
        <Masthead left={`Quill — ${issue.combined}`} right={today} />

        <header className="mb-12">
          <h1
            className="font-serif text-[clamp(2.25rem,1.4rem+2.4vw,3.25rem)] leading-[1.05] tracking-tight"
            style={{ letterSpacing: '-0.024em' }}
          >
            Note every meeting.<br />
            <span className="italic text-ink-muted">Polish it later.</span>
          </h1>
          <p className="mt-5 max-w-prose text-ink-muted leading-relaxed">
            A quiet notetaker that listens to your computer's audio and your
            microphone, transcribes the conversation locally, and turns rough
            notes into a clean writeup.
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

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <span className="eyebrow">In this issue</span>
            {meetings.length > 0 && (
              <span className="dateline">
                {meetings.length} {meetings.length === 1 ? 'ENTRY' : 'ENTRIES'}
              </span>
            )}
          </div>
          <div className="rule" />

          {meetings.length === 0 ? (
            <div className="grain relative px-6 py-16 text-center">
              <p className="microcopy text-base max-w-sm mx-auto leading-relaxed">
                A blank page. Hit record when the meeting starts.
              </p>
            </div>
          ) : (
            <ol ref={listRef} className="divide-y divide-edge">
              {meetings.slice(0, 24).map((m) => {
                const dur = durationLabel(m);
                const voices = voicesLabel(m);
                const dateline = [
                  SHORT_WEEKDAY(m.startedAt),
                  HHMM(m.startedAt),
                  dur,
                  voices,
                  m.enhancedNotes ? 'ENHANCED' : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li
                    key={m.id}
                    data-issue-row
                    className="no-drag group cursor-pointer py-4 transition-colors hover:bg-surface-2 -mx-2 px-2 rounded-sm"
                    onClick={() => nav(`/meeting/${m.id}`)}
                  >
                    <div className="flex items-baseline justify-between gap-6">
                      <div className="min-w-0 flex-1">
                        <h3
                          className="font-serif text-xl font-medium tracking-tight truncate group-hover:text-ink"
                          style={{ letterSpacing: '-0.018em' }}
                        >
                          {m.title || 'Untitled'}
                        </h3>
                        <div className="dateline mt-1.5">{dateline}</div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
