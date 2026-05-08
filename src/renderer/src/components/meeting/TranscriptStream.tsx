import { useEffect, useRef } from 'react';
import type { TranscriptEntry } from '@shared/types.js';

export function TranscriptStream({ entries }: { entries: TranscriptEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries.length]);

  return (
    <div
      ref={ref}
      className="scroll-thin h-full overflow-y-auto px-5 py-4 space-y-3"
      data-testid="transcript-stream"
    >
      {entries.length === 0 && (
        <div className="text-sm text-ink-soft">
          When you hit record, this pane fills with the live transcript. Grey
          bubbles = others (system audio). Green bubbles = you (mic).
        </div>
      )}
      {entries.map((e) => (
        <div
          key={e.id}
          className={`max-w-[88%] rounded-md px-3 py-2 text-sm leading-snug ${
            e.speaker === 'mic'
              ? 'ml-auto'
              : 'mr-auto'
          }`}
          style={
            e.speaker === 'mic'
              ? {
                  background: 'oklch(var(--moss) / 0.14)',
                  color: 'oklch(var(--ink))',
                }
              : {
                  background: 'oklch(var(--surface-3))',
                  color: 'oklch(var(--ink))',
                }
          }
          data-speaker={e.speaker}
        >
          <div className="text-[10px] uppercase tracking-wider text-ink-soft mb-0.5">
            {e.speaker === 'mic' ? 'You' : 'Other'} · {clock(e.startedAtMs)}
          </div>
          {e.text}
        </div>
      ))}
    </div>
  );
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
