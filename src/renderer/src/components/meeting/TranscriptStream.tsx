import { useEffect, useRef } from 'react';
import { animate } from 'motion';
import type { TranscriptEntry } from '@shared/types.js';

export function TranscriptStream({ entries }: { entries: TranscriptEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
    // Soft fade on the LAST transcript entry that just arrived. Skip the
    // very first mount so a long preloaded transcript doesn't fade in
    // entry by entry. Mirrors the chat MessageList pattern.
    if (entries.length > lastCountRef.current && lastCountRef.current > 0) {
      const rows = ref.current.querySelectorAll('[data-speaker]');
      const newest = rows[rows.length - 1];
      if (newest) {
        animate(
          newest as Element,
          { opacity: [0, 1], y: [4, 0] },
          { duration: 0.22, ease: 'easeOut' },
        );
      }
    }
    lastCountRef.current = entries.length;
  }, [entries.length]);

  return (
    <div
      ref={ref}
      className="scroll-thin h-full overflow-y-auto px-5 py-4 space-y-5"
      data-testid="transcript-stream"
    >
      {entries.length === 0 && (
        <p className="microcopy text-sm leading-relaxed max-w-prose">
          When you hit record, the conversation lands here — yours on the
          right, the other side on the left.
        </p>
      )}
      {entries.map((e) => {
        const isMine = e.speaker === 'mic';
        return (
          <div
            key={e.id}
            data-speaker={e.speaker}
            className={`max-w-[88%] ${isMine ? 'ml-auto' : 'mr-auto'}`}
          >
            <div className={`dateline mb-1 ${isMine ? 'text-right' : ''}`}>
              {isMine ? 'YOU' : 'OTHER'} · {clock(e.startedAtMs)}
            </div>
            {isMine ? (
              <p className="font-serif italic text-[14.5px] leading-relaxed text-right whitespace-pre-wrap text-ink">
                {e.text}
              </p>
            ) : (
              <p
                className="pl-3 text-[14px] leading-relaxed text-ink whitespace-pre-wrap border-l-2"
                style={{ borderColor: 'oklch(var(--moss) / 0.7)' }}
              >
                {e.text}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
