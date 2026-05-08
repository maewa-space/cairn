import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Meeting, TranscriptEntry } from '@shared/types.js';
import { NotesEditor } from '../components/meeting/NotesEditor';
import { TranscriptStream } from '../components/meeting/TranscriptStream';
import { RecordControls } from '../components/meeting/RecordControls';
import { EnhanceBar } from '../components/meeting/EnhanceBar';
import { EnhancedView } from '../components/meeting/EnhancedView';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { useChunkedTranscriber } from '../hooks/useChunkedTranscriber';
import { formatTime } from '../lib/date';

const NOTES_DEBOUNCE_MS = 600;

export function MeetingRoute() {
  const { id = '' } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [notes, setNotes] = useState('');
  const [view, setView] = useState<'notes' | 'enhanced'>('notes');
  const [enhanced, setEnhanced] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');

  const [micLevel, setMicLevel] = useState(0);
  const [systemLevel, setSystemLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedRef = useRef<number | null>(null);

  const { enqueue } = useChunkedTranscriber({
    onEntry: (entry) => setEntries((prev) => [...prev, entry]),
    onError: (err) => console.error('[transcribe]', err),
  });

  const capture = useAudioCapture({
    chunkSeconds: 20,
    onChunk: ({ speaker, blob, startedAtMs, durationMs }) => {
      enqueue({ meetingId: id, speaker, blob, startedAtMs, durationMs });
    },
    onLevel: (mic, sys) => {
      setMicLevel(mic);
      setSystemLevel(sys);
    },
  });

  // Load meeting
  useEffect(() => {
    if (!id) return;
    window.cairn.meetings.get(id).then((m) => {
      if (!m) return;
      setMeeting(m);
      setNotes(m.rawNotes);
      setTitleDraft(m.title);
      setEntries(m.transcript);
      setEnhanced(m.enhancedNotes);
      setTemplateId(m.templateId);
      setView(m.enhancedNotes ? 'enhanced' : 'notes');
    });
  }, [id]);

  // Debounced notes save
  const notesRef = useRef(notes);
  notesRef.current = notes;
  useEffect(() => {
    if (!id) return;
    const t = window.setTimeout(() => {
      window.cairn.meetings.saveNotes(id, notesRef.current);
    }, NOTES_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [notes, id]);

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
    await window.cairn.meetings.rename(meeting.id, titleDraft || 'Untitled');
  };

  const stopRecording = useCallback(async () => {
    await capture.stop();
    if (id) await window.cairn.meetings.end(id);
  }, [capture, id]);

  const runEnhance = useCallback(async () => {
    if (!templateId || !id) return;
    setEnhancing(true);
    try {
      const result = await window.cairn.enhance.run({
        meetingId: id,
        templateId,
        rawNotes: notesRef.current,
      });
      setEnhanced(result.markdown);
      setView('enhanced');
    } catch (e) {
      console.error('[enhance]', e);
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setEnhancing(false);
    }
  }, [templateId, id]);

  const startedAtLabel = useMemo(
    () => (meeting ? formatTime(meeting.startedAt) : ''),
    [meeting],
  );

  if (!meeting) {
    return (
      <div className="pt-12 px-10 text-ink-soft">Loading meeting…</div>
    );
  }

  return (
    <div className="grid h-full grid-rows-[auto_1fr] pt-9">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 border-b hairline px-6 py-3">
        <div className="min-w-0 flex-1">
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={onTitleBlur}
            className="w-full bg-transparent font-serif text-xl tracking-tight focus:outline-none"
            style={{ letterSpacing: '-0.02em' }}
            data-testid="meeting-title"
          />
          <div className="text-[11px] text-ink-soft mt-0.5">
            Started {startedAtLabel}
            {capture.state === 'recording' && (
              <span className="ml-2 inline-flex items-center gap-1 text-accent">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: 'oklch(var(--accent))' }}
                />
                live
              </span>
            )}
          </div>
        </div>
        <RecordControls
          state={capture.state}
          error={capture.error}
          hasMic={capture.hasMic}
          hasSystem={capture.hasSystem}
          micLevel={micLevel}
          systemLevel={systemLevel}
          elapsedMs={elapsedMs}
          onStart={capture.start}
          onStop={stopRecording}
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
      </div>

      {/* Two-pane body */}
      <div className="grid h-full min-h-0 grid-cols-[1fr_360px]">
        <div className="flex h-full min-h-0 flex-col">
          {enhanced && (
            <div className="flex items-center gap-1 border-b hairline px-5 py-1.5 text-[11px]">
              <button
                onClick={() => setView('notes')}
                className={`rounded-md px-2 py-1 ${
                  view === 'notes'
                    ? 'bg-surface-3 text-ink'
                    : 'text-ink-muted'
                }`}
              >
                Raw notes
              </button>
              <button
                onClick={() => setView('enhanced')}
                className={`rounded-md px-2 py-1 ${
                  view === 'enhanced'
                    ? 'bg-surface-3 text-ink'
                    : 'text-ink-muted'
                }`}
              >
                Enhanced
              </button>
            </div>
          )}
          <div className="scroll-thin h-full overflow-y-auto px-7 py-5">
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
        <div className="border-l hairline flex flex-col">
          <div className="px-5 pt-3 pb-1 text-[11px] uppercase tracking-wider text-ink-soft">
            Live transcript
          </div>
          <TranscriptStream entries={entries} />
        </div>
      </div>
    </div>
  );
}
