import { useEffect, useMemo, useRef } from 'react';
import { animate } from 'motion';
import type { Speaker, TranscriptEntry } from '@shared/types.js';
import { isDiarizedSpeaker, diarizedSpeakerIndex } from '@shared/types.js';

/** Render label for the eyebrow above each transcript group. */
function speakerLabel(speaker: Speaker): string {
  if (speaker === 'mic') return 'YOU';
  if (speaker === 'system') return 'OTHER';
  const n = diarizedSpeakerIndex(speaker);
  return n ? `SPEAKER ${n}` : 'OTHER';
}

/** Border color for the left-rule on each non-mic group. Diarized speakers
 *  cycle through a small palette of moss alpha variants so different
 *  voices read as visually distinct without leaving the editorial palette. */
function speakerBorderColor(speaker: Speaker): string {
  if (isDiarizedSpeaker(speaker)) {
    const n = diarizedSpeakerIndex(speaker) ?? 1;
    // Cycle hue offset by speaker index — same lightness/chroma so all
    // diarized speakers read as muted moss-family but distinguishable.
    const hueOffset = ((n - 1) * 24) % 360;
    return `oklch(38% 0.06 calc(158 + ${hueOffset}))`;
  }
  return 'oklch(var(--moss) / 0.7)';
}

interface TranscriptGroup {
  /** Identifier of the *first* entry in the group; React key. */
  id: string;
  speaker: Speaker;
  startedAtMs: number;
  /** Concatenated text of every contiguous same-speaker chunk. */
  text: string;
  /** Number of source entries collapsed in. Used to detect appends. */
  chunkCount: number;
}

// Two same-speaker chunks within this gap (ms) are coalesced into one
// flowing paragraph instead of rendering as two stacked entries. 4 seconds
// is enough to bridge a single dropped silent chunk + the RMS gate's
// holdoff but short enough that genuine turn-taking still creates a new
// group. Tunable.
const COALESCE_GAP_MS = 4000;

function groupEntries(entries: TranscriptEntry[]): TranscriptGroup[] {
  const groups: TranscriptGroup[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    const lastEnd = last ? last.startedAtMs + chunkSpan(last) : -Infinity;
    if (last && last.speaker === e.speaker && e.startedAtMs - lastEnd < COALESCE_GAP_MS) {
      last.text = `${last.text} ${e.text}`.trim();
      last.chunkCount += 1;
    } else {
      groups.push({
        id: e.id,
        speaker: e.speaker,
        startedAtMs: e.startedAtMs,
        text: e.text,
        chunkCount: 1,
      });
    }
  }
  return groups;
}

function chunkSpan(group: TranscriptGroup): number {
  // Approximate the group's duration based on chunk count + average length.
  // We don't carry exact durations through coalesce because we'd need to
  // re-fetch them; the gap heuristic above is what matters.
  return group.chunkCount * 5000;
}

export function TranscriptStream({
  entries,
  interim,
}: {
  entries: TranscriptEntry[];
  interim?: { speaker: Speaker; text: string } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastGroupCountRef = useRef(0);
  const lastGroupIdRef = useRef<string | null>(null);

  const groups = useMemo(() => groupEntries(entries), [entries]);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;

    // Two animation cases:
    //   (1) A NEW group started → fade-up the whole new paragraph block.
    //   (2) An existing group got an append → no animation; the appended
    //       text just flows in. Feels closer to streaming transcription.
    const prevCount = lastGroupCountRef.current;
    const prevTailId = lastGroupIdRef.current;
    const lastGroup = groups[groups.length - 1] ?? null;

    if (prevCount > 0 && groups.length > prevCount && lastGroup) {
      // New group case (1).
      const rows = ref.current.querySelectorAll('[data-group]');
      const newest = rows[rows.length - 1];
      if (newest) {
        animate(
          newest as Element,
          { opacity: [0, 1], y: [4, 0] },
          { duration: 0.22, ease: 'easeOut' },
        );
      }
    }

    lastGroupCountRef.current = groups.length;
    lastGroupIdRef.current = lastGroup?.id ?? null;
    void prevTailId;
  }, [groups]);

  return (
    <div
      ref={ref}
      className="scroll-thin h-full overflow-y-auto px-5 py-4 space-y-5"
      data-testid="transcript-stream"
    >
      {groups.length === 0 && (
        <p className="microcopy text-sm leading-relaxed max-w-prose">
          When you hit record, the conversation lands here — yours on the
          right, the other side on the left.
        </p>
      )}
      {groups.map((g) => {
        const isMine = g.speaker === 'mic';
        return (
          <div
            key={g.id}
            data-group={g.speaker}
            data-speaker={g.speaker}
            className={`max-w-[88%] ${isMine ? 'ml-auto' : 'mr-auto'}`}
          >
            <div className={`dateline mb-1 ${isMine ? 'text-right' : ''}`}>
              {speakerLabel(g.speaker)} · {clock(g.startedAtMs)}
            </div>
            {isMine ? (
              <p className="font-serif italic text-[14.5px] leading-relaxed text-right whitespace-pre-wrap text-ink">
                {g.text}
              </p>
            ) : (
              <p
                className="pl-3 text-[14px] leading-relaxed text-ink whitespace-pre-wrap border-l-2"
                style={{ borderColor: speakerBorderColor(g.speaker) }}
              >
                {g.text}
              </p>
            )}
          </div>
        );
      })}
      {interim && interim.text && (
        <div
          data-testid="transcript-interim"
          className={`max-w-[88%] ${interim.speaker === 'mic' ? 'ml-auto' : 'mr-auto'}`}
        >
          <div
            className={`dateline mb-1 ${interim.speaker === 'mic' ? 'text-right' : ''}`}
          >
            {speakerLabel(interim.speaker)} · LIVE
          </div>
          {interim.speaker === 'mic' ? (
            <p className="font-serif italic text-[14.5px] leading-relaxed text-right whitespace-pre-wrap text-ink-soft">
              {interim.text}
            </p>
          ) : (
            <p
              className="pl-3 text-[14px] leading-relaxed text-ink-soft whitespace-pre-wrap border-l-2"
              style={{
                borderColor: isDiarizedSpeaker(interim.speaker)
                  ? speakerBorderColor(interim.speaker)
                  : 'oklch(var(--moss) / 0.4)',
              }}
            >
              {interim.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
