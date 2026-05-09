import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { animate } from 'motion';
import type { Folder, Meeting, Speaker, TranscriptEntry } from '@shared/types.js';
import { NotesEditor } from '../components/meeting/NotesEditor';
import { RecordControls, RedDot } from '../components/meeting/RecordControls';
import { EnhanceBar } from '../components/meeting/EnhanceBar';
import { EnhancedView } from '../components/meeting/EnhancedView';
import { MeetingActions } from '../components/meeting/MeetingActions';
import { RightPane } from '../components/meeting/RightPane';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { useChunkedTranscriber } from '../hooks/useChunkedTranscriber';
import { useStreamingCapture } from '../hooks/useStreamingCapture';
import { BREAKPOINTS, useMediaQuery } from '../hooks/useMediaQuery';
import { formatTime } from '../lib/date';
import { storedToLanguage } from '@shared/transcript-language.js';

const NOTES_DEBOUNCE_MS = 600;

export function MeetingRoute() {
  const { id = '' } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [notes, setNotes] = useState('');
  const [view, setView] = useState<'notes' | 'enhanced'>('notes');
  const [enhanced, setEnhanced] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);

  const [micLevel, setMicLevel] = useState(0);
  const [systemLevel, setSystemLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const [bodyTab, setBodyTab] = useState<'body' | 'side'>('body');
  const [interim, setInterim] = useState<{
    speaker: Speaker;
    text: string;
  } | null>(null);
  // Pipeline choice — flips to streaming when the user has a Deepgram key
  // saved. Resolved at mount; switching providers mid-meeting is not
  // supported (we'd have to tear down + rebuild the audio pipeline).
  const [streamingMode, setStreamingMode] = useState<boolean | null>(null);
  // Transcription preferences — read once at mount. Switching mid-meeting
  // would require restarting the WS / Whisper queue, so we snapshot.
  const [language, setLanguage] = useState<string | undefined>(undefined);
  const [diarize, setDiarize] = useState(false);
  const isNarrow = useMediaQuery(BREAKPOINTS.narrowBody);
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const startedRef = useRef<number | null>(null);
  const viewWrapperRef = useRef<HTMLDivElement>(null);
  // Soft slide between Raw notes ↔ Enhanced view. Skip the first paint so
  // the wrapper doesn't fade in on initial mount, only on user-triggered
  // toggles. Reduced-motion guard collapses to ~0ms automatically.
  const firstViewRef = useRef(true);

  // Resolve pipeline + transcription preferences once on mount.
  useEffect(() => {
    let alive = true;
    Promise.all([
      window.quill.keys.has('deepgram'),
      window.quill.settings.get('transcript.language'),
      window.quill.settings.get('transcript.diarize'),
    ])
      .then(([has, lang, diar]) => {
        if (!alive) return;
        setStreamingMode(has);
        setLanguage(storedToLanguage(lang));
        setDiarize(diar === '1');
      })
      .catch(() => {
        if (alive) setStreamingMode(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const { enqueue, pending: pendingChunks } = useChunkedTranscriber({
    // Auto-detect by default — the user can pin a specific language in
    // Settings → Transcription if they want to lock it down.
    language,
    onEntry: (entry) => setEntries((prev) => [...prev, entry]),
    onError: (err) => console.error('[transcribe]', err),
  });

  const batchCapture = useAudioCapture({
    // 5-second chunks instead of 10 — halves the latency from "you finished
    // a sentence" to "the transcript shows it." Closer in feel to streaming
    // transcription. Trade-off: roughly 2× Whisper API calls per minute.
    chunkSeconds: 5,
    onChunk: ({ speaker, blob, startedAtMs, durationMs }) => {
      enqueue({ meetingId: id, speaker, blob, startedAtMs, durationMs });
    },
    onLevel: (mic, sys) => {
      setMicLevel(mic);
      setSystemLevel(sys);
    },
  });

  const streamingCapture = useStreamingCapture({
    meetingId: id,
    language,
    diarize,
    onEntry: (entry) => {
      setEntries((prev) => [...prev, entry]);
      setInterim(null);
    },
    onInterim: (info) => {
      setInterim({ speaker: info.speaker, text: info.text });
    },
    onLevel: (mic, sys) => {
      setMicLevel(mic);
      setSystemLevel(sys);
    },
  });

  // Active capture pipeline — always defined so React hooks fire above don't
  // get conditional, but the inactive one is a no-op until its start() runs.
  const capture = streamingMode ? streamingCapture : batchCapture;

  // Load meeting
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoadError(null);
    window.quill.meetings
      .get(id)
      .then((m) => {
        if (!alive) return;
        if (!m) {
          setLoadError(`Meeting ${id} not found.`);
          return;
        }
        setMeeting(m);
        setNotes(m.rawNotes);
        setTitleDraft(m.title);
        setEntries(m.transcript);
        setEnhanced(m.enhancedNotes);
        // Don't clobber a templateId that EnhanceBar may have already
        // bootstrapped to the first template — only override when the
        // meeting actually has one persisted on it.
        setTemplateId((cur) => m.templateId ?? cur);
        setFolderId(m.folderId);
        setView(m.enhancedNotes ? 'enhanced' : 'notes');
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[meeting] load failed:', err);
        setLoadError(msg);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  // Reflect the meeting title in the window chrome.
  useEffect(() => {
    if (titleDraft) {
      document.title = `Quill — ${titleDraft}`;
    }
  }, [titleDraft]);

  // Load folders so we can offer "Move to folder…"
  useEffect(() => {
    let alive = true;
    window.quill.folders
      .list()
      .then((list) => {
        if (alive) setFolders(list);
      })
      .catch((err: unknown) => {
        // Folder list is non-blocking — failing to load just means the
        // "Move to folder" submenu is empty. Log so we can debug later.
        console.warn('[meeting] folders.list failed:', err);
      });
    return () => {
      alive = false;
    };
  }, []);

  const moveToFolder = useCallback(
    async (next: string | null) => {
      if (!id) return;
      await window.quill.meetings.moveToFolder(id, next);
      setFolderId(next);
    },
    [id],
  );

  // Debounced notes save
  const notesRef = useRef(notes);
  notesRef.current = notes;
  useEffect(() => {
    if (!id) return;
    const t = window.setTimeout(() => {
      window.quill.meetings.saveNotes(id, notesRef.current).then(
        () => {
          // Clear any prior persistent save-error banner once a write succeeds.
          setNotesError((prev) => (prev ? null : prev));
        },
        (err: unknown) => {
          // Without this catch a DB failure (disk full, locked file, schema
          // mismatch) was completely silent — the user kept typing and
          // believed everything persisted. Surface a banner instead.
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[notes] save failed:', err);
          setNotesError(msg);
        },
      );
    }, NOTES_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [notes, id]);

  // Slide between Raw notes ↔ Enhanced view on user toggle.
  useEffect(() => {
    if (firstViewRef.current) {
      firstViewRef.current = false;
      return;
    }
    const el = viewWrapperRef.current;
    if (!el) return;
    animate(
      el,
      { opacity: [0, 1], x: [4, 0] },
      { duration: 0.22, ease: 'easeOut' },
    );
  }, [view]);

  // Elapsed timer while recording
  useEffect(() => {
    if (capture.state === 'recording') {
      startedRef.current = performance.now();
      const t = window.setInterval(() => {
        if (startedRef.current != null) {
          setElapsedMs(performance.now() - startedRef.current);
        }
      }, 250);
      return () => window.clearInterval(t);
    }
    if (capture.state === 'idle') {
      startedRef.current = null;
      setElapsedMs(0);
    }
  }, [capture.state]);

  const onTitleBlur = async () => {
    if (!meeting || titleDraft === meeting.title) return;
    await window.quill.meetings.rename(meeting.id, titleDraft || 'Untitled');
  };

  const stopRecording = useCallback(async () => {
    await capture.stop();
    if (!id) return;
    await window.quill.meetings.end(id);
    // Best-effort transcript-based auto-titling. Only changes the title
    // if it's still the default "Untitled meeting" — calendar-matched
    // titles are preserved. Fire-and-forget; the sidebar broadcast
    // refreshes the row when it lands.
    window.quill.meetings
      .autoTitle(id)
      .then((next) => {
        if (next) {
          setTitleDraft(next);
          setMeeting((m) => (m ? { ...m, title: next } : m));
        }
      })
      .catch((err) => {
        console.warn('[meeting] auto-title failed:', err);
      });
  }, [capture, id]);

  const deleteMeeting = useCallback(async () => {
    if (!id) return;
    if (capture.state === 'recording') await capture.stop();
    await window.quill.meetings.delete(id);
    nav('/home');
  }, [id, capture, nav]);

  const runEnhance = useCallback(async () => {
    if (!id) return;
    // Auto-pick when the user left the dropdown on "Auto" (templateId is
    // null). LLM-routes to the best-fitting template based on what was
    // actually said. Falls back through main → templates[0] → "no
    // templates" error so the click is never silent.
    let tid = templateId;
    if (!tid) {
      try {
        tid = await window.quill.templates.autoPick(id);
        if (tid) setTemplateId(tid);
      } catch (err) {
        console.warn('[enhance] auto-pick failed; falling back to first template:', err);
        try {
          const list = await window.quill.templates.list();
          tid = list[0]?.id ?? null;
          if (tid) setTemplateId(tid);
        } catch (err2) {
          console.error('[enhance] template list failed:', err2);
        }
      }
    }
    if (!tid) {
      setEnhanceError(
        'No templates available. Add one in Templates before enhancing.',
      );
      return;
    }
    setEnhanceError(null);
    setEnhancing(true);
    try {
      const result = await window.quill.enhance.run({
        meetingId: id,
        templateId: tid,
        rawNotes: notesRef.current,
      });
      setEnhanced(result.markdown);
      setView('enhanced');
      // Refine the auto-title now that we have polished notes — much
      // stronger signal than raw transcript alone. Skipped automatically
      // if the user already typed a title (titleIsAuto cleared on rename).
      window.quill.meetings
        .autoTitle(id)
        .then((next) => {
          if (next) {
            setTitleDraft(next);
            setMeeting((m) => (m ? { ...m, title: next } : m));
          }
        })
        .catch((err) => {
          console.warn('[enhance] auto-title refine failed:', err);
        });
    } catch (e) {
      console.error('[enhance]', e);
      setEnhanceError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnhancing(false);
    }
  }, [templateId, id]);

  const startedAtLabel = useMemo(
    () => (meeting ? formatTime(meeting.startedAt) : ''),
    [meeting],
  );

  if (loadError) {
    return (
      <div className="pt-16 px-5 sm:px-10 max-w-2xl mx-auto">
        <div className="eyebrow mb-3" style={{ color: 'oklch(var(--accent))' }}>
          A page is missing
        </div>
        <div className="rule mb-5" />
        <p className="microcopy text-base leading-relaxed mb-1">
          we couldn't open this meeting.
        </p>
        <p className="font-mono text-[12px] text-ink-soft leading-relaxed mt-3">
          {loadError}
        </p>
        <button
          className="btn btn-ghost mt-6"
          onClick={() => nav('/home')}
        >
          ← Back to home
        </button>
      </div>
    );
  }

  if (!meeting) {
    // Skeleton silhouette in the rough shape of the meeting page — keeps the
    // layout from snapping into place when the IPC resolves. Shimmers via
    // the `breathe` keyframe at low contrast.
    return (
      <div className="pt-16 px-5 sm:px-10 max-w-3xl mx-auto">
        <div
          className="h-7 w-2/3 rounded-md bg-surface-3"
          style={{ animation: 'breathe 2.4s var(--ease-in-out-soft) infinite' }}
        />
        <div className="rule mt-4 mb-6" />
        <div className="space-y-3">
          <div
            className="h-3 w-full rounded-sm bg-surface-3"
            style={{ animation: 'breathe 2.4s var(--ease-in-out-soft) infinite', animationDelay: '0.1s' }}
          />
          <div
            className="h-3 w-11/12 rounded-sm bg-surface-3"
            style={{ animation: 'breathe 2.4s var(--ease-in-out-soft) infinite', animationDelay: '0.2s' }}
          />
          <div
            className="h-3 w-9/12 rounded-sm bg-surface-3"
            style={{ animation: 'breathe 2.4s var(--ease-in-out-soft) infinite', animationDelay: '0.3s' }}
          />
        </div>
        <p className="microcopy mt-8 text-sm">opening the meeting…</p>
      </div>
    );
  }

  const showBody = !isNarrow || bodyTab === 'body';
  const showSide = !isNarrow || bodyTab === 'side';
  const horizontalPad = isMobile ? 'px-4' : 'px-6';
  const bodyPad = isMobile ? 'px-4 py-4' : 'px-7 py-5';

  return (
    <div className="grid h-full grid-rows-[auto_1fr] pt-9">
      {/* Top bar — wraps under ~820px so the title stays legible while
          recording controls fall to a second row instead of clipping. */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 gap-y-2 border-b hairline ${horizontalPad} py-3`}
      >
        <div className="min-w-0 flex-1 basis-[220px]">
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={onTitleBlur}
            className={`w-full bg-transparent font-serif tracking-tight focus:outline-none placeholder:text-ink-soft ${
              isMobile ? 'text-xl' : 'text-2xl'
            }`}
            style={{ letterSpacing: '-0.022em', fontWeight: 500 }}
            placeholder="Untitled meeting"
            data-testid="meeting-title"
          />
          <div className="dateline mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span>STARTED {startedAtLabel.toUpperCase()}</span>
            {meeting.attendees.length > 0 && (
              <span
                className="inline-flex items-center gap-1.5 normal-case tracking-normal text-ink-soft"
                data-testid="meeting-attendees"
              >
                <span aria-hidden>·</span>
                <span className="font-serif italic text-[12px]">
                  {meeting.attendees.slice(0, 3).join(', ')}
                  {meeting.attendees.length > 3 &&
                    ` +${meeting.attendees.length - 3}`}
                </span>
              </span>
            )}
            {capture.state === 'recording' && (
              <span className="inline-flex items-center gap-1.5 text-accent normal-case tracking-normal">
                <RedDot tone="on-page" />
                <span className="font-serif italic text-[12px]">live</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 gap-y-2">
          <RecordControls
            state={capture.state}
            error={capture.error}
            micError={capture.micError}
            systemError={capture.systemError}
            hasMic={capture.hasMic}
            hasSystem={capture.hasSystem}
            reconnecting={capture.reconnecting}
            micLevel={micLevel}
            systemLevel={systemLevel}
            elapsedMs={elapsedMs}
            pendingChunks={pendingChunks}
            onStart={capture.start}
            onStop={stopRecording}
            onRetrySystem={capture.retrySystem}
            onOpenMicSettings={() =>
              window.quill.permissions.openSystemSettings('mic')
            }
          />
          <EnhanceBar
            disabled={
              entries.length === 0 && (notes.trim().length === 0)
            }
            enhancing={enhancing}
            selectedTemplateId={templateId}
            onSelect={setTemplateId}
            onRun={runEnhance}
          />
          <MeetingActions
            meetingId={id}
            meetingTitle={titleDraft || 'Untitled meeting'}
            currentFolderId={folderId}
            folders={folders}
            rawNotesHtml={notes}
            enhancedMarkdown={enhanced}
            onDelete={deleteMeeting}
            onMoveToFolder={moveToFolder}
          />
        </div>
      </div>

      {/* Narrow widths: tab toggle to switch between Notes and the right pane.
          Wide widths: render both side-by-side as before. */}
      {isNarrow && (
        <div
          className={`flex items-center gap-5 border-b hairline ${horizontalPad} py-2`}
          data-testid="body-tabs"
        >
          <button
            onClick={() => setBodyTab('body')}
            className={`eyebrow transition-colors ${
              bodyTab === 'body' ? 'text-ink' : 'hover:text-ink-muted'
            }`}
            data-testid="body-tab-notes"
          >
            Notes
          </button>
          <span className="text-ink-soft" aria-hidden>·</span>
          <button
            onClick={() => setBodyTab('side')}
            className={`eyebrow transition-colors ${
              bodyTab === 'side' ? 'text-ink' : 'hover:text-ink-muted'
            }`}
            data-testid="body-tab-side"
          >
            Chat &amp; transcript
          </button>
        </div>
      )}

      <div
        className={`grid h-full min-h-0 ${
          isNarrow ? 'grid-cols-1' : 'grid-cols-[1fr_minmax(280px,360px)]'
        }`}
      >
        {showBody && (
          <div className="flex h-full min-h-0 flex-col">
            {enhanced && (
              <div className={`flex items-baseline gap-5 border-b hairline ${horizontalPad} py-2.5`}>
                <button
                  onClick={() => setView('notes')}
                  aria-pressed={view === 'notes'}
                  className={`eyebrow transition-colors pb-0.5 border-b-2 ${
                    view === 'notes'
                      ? 'text-ink border-b-ink'
                      : 'border-b-transparent hover:text-ink-muted'
                  }`}
                >
                  Raw notes
                </button>
                <span className="text-ink-soft" aria-hidden>·</span>
                <button
                  onClick={() => setView('enhanced')}
                  aria-pressed={view === 'enhanced'}
                  className={`eyebrow transition-colors pb-0.5 border-b-2 ${
                    view === 'enhanced'
                      ? 'text-ink border-b-moss'
                      : 'border-b-transparent hover:text-ink-muted'
                  }`}
                >
                  Enhanced
                </button>
                {view === 'enhanced' && (
                  <span className="dateline ml-auto">POLISHED</span>
                )}
              </div>
            )}
            {notesError && (
              <div
                role="alert"
                aria-live="polite"
                className={`mx-${isMobile ? '4' : '7'} mt-3 flex items-start justify-between gap-3 border-t border-l-2 border-l-accent border-t-edge px-3 py-2`}
              >
                <p className="microcopy text-xs leading-relaxed">
                  <span
                    className="eyebrow mr-1.5"
                    style={{ color: 'oklch(var(--accent))' }}
                  >
                    Couldn't save
                  </span>
                  your last edits aren't on disk
                  <span className="ml-1 opacity-60 not-italic font-mono">({notesError})</span>
                </p>
                <button
                  className="text-ink-soft hover:text-ink underline shrink-0 text-xs"
                  onClick={() => setNotesError(null)}
                >
                  Dismiss
                </button>
              </div>
            )}
            {enhanceError && (
              <div
                role="alert"
                aria-live="polite"
                data-testid="enhance-error"
                className={`mx-${isMobile ? '4' : '7'} mt-3 flex items-start justify-between gap-3 border-t border-l-2 border-l-accent border-t-edge px-3 py-2`}
              >
                <p className="microcopy text-xs leading-relaxed">
                  <span
                    className="eyebrow mr-1.5"
                    style={{ color: 'oklch(var(--accent))' }}
                  >
                    Couldn't enhance
                  </span>
                  <span className="ml-1 opacity-80 not-italic font-mono">{enhanceError}</span>
                </p>
                <button
                  className="text-ink-soft hover:text-ink underline shrink-0 text-xs"
                  onClick={() => setEnhanceError(null)}
                >
                  Dismiss
                </button>
              </div>
            )}
            <div className={`scroll-thin h-full overflow-y-auto ${bodyPad}`}>
              <div ref={viewWrapperRef}>
                {view === 'enhanced' && enhanced ? (
                  <EnhancedView markdown={enhanced} />
                ) : (
                  <NotesEditor
                    initialMarkdown={notes}
                    onChange={setNotes}
                    placeholder="Type rough notes here while you listen…"
                  />
                )}
              </div>
            </div>
          </div>
        )}
        {showSide && (
          <div
            className={`${
              isNarrow ? 'border-t' : 'border-l'
            } hairline flex flex-col min-h-0`}
          >
            <RightPane meetingId={id} entries={entries} interim={interim} />
          </div>
        )}
      </div>
    </div>
  );
}
