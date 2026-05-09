import { Mic, RefreshCw, Speaker, Square, Loader2 } from 'lucide-react';

interface RecordControlsProps {
  state: 'idle' | 'starting' | 'recording' | 'stopping' | 'error';
  error: string | null;
  micError: string | null;
  systemError: string | null;
  hasMic: boolean;
  hasSystem: boolean;
  /** Streaming-only — surfaces a quiet "reconnecting…" indicator so a brief
   *  WS drop doesn't read as a hard error. */
  reconnecting?: boolean;
  micLevel: number;
  systemLevel: number;
  elapsedMs: number;
  pendingChunks: number;
  onStart: () => void;
  onStop: () => void;
  onRetrySystem: () => void;
  onOpenMicSettings: () => void;
}

export function RecordControls(props: RecordControlsProps) {
  const recording = props.state === 'recording';
  const transient = props.state === 'starting' || props.state === 'stopping';

  return (
    <div className="flex items-center gap-3">
      {!recording && (
        <button
          onClick={props.onStart}
          disabled={transient}
          className="btn btn-record disabled:opacity-50"
          data-testid="record-start"
        >
          {transient ? <Loader2 size={14} className="animate-spin" /> : <RedDot />}
          {props.state === 'starting' ? (
            <span className="font-serif italic">starting…</span>
          ) : (
            'Start recording'
          )}
        </button>
      )}
      {recording && (
        <button
          onClick={props.onStop}
          className="btn btn-secondary"
          data-testid="record-stop"
        >
          <Square size={12} fill="currentColor" /> Stop
        </button>
      )}

      {(recording || transient) && (
        <>
          <div className="text-xs font-mono text-ink-muted tabular-nums">
            {clock(props.elapsedMs)}
          </div>
          {props.pendingChunks > 0 && (
            <div
              className="flex items-center gap-1 text-[11px] text-ink-soft"
              title={`${props.pendingChunks} chunk(s) being transcribed`}
              data-testid="pending-chunks"
            >
              <Loader2 size={11} className="animate-spin" />
              <span className="tabular-nums">{props.pendingChunks}</span>
            </div>
          )}
          {props.reconnecting && (
            <div
              className="flex items-center gap-1 text-[11px] text-ink-soft italic"
              title="Reconnecting to Deepgram — buffered audio will replay automatically"
              data-testid="reconnecting"
            >
              <Loader2 size={11} className="animate-spin" />
              <span className="font-serif">reconnecting…</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Meter
              icon={<Speaker size={11} />}
              label="System"
              level={props.systemLevel}
              active={props.hasSystem}
              tooltip={props.systemError ?? undefined}
            />
            {recording && !props.hasSystem && (
              <button
                type="button"
                onClick={props.onRetrySystem}
                title="Retry system audio (re-opens the macOS picker)"
                className="rounded p-1 text-ink-soft hover:text-ink hover:bg-surface-3"
                data-testid="record-retry-system"
              >
                <RefreshCw size={11} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Meter
              icon={<Mic size={11} />}
              label="You"
              level={props.micLevel}
              active={props.hasMic}
              tooltip={props.micError ?? undefined}
            />
            {recording && !props.hasMic && (
              <button
                type="button"
                onClick={props.onOpenMicSettings}
                title="Open Microphone permission settings"
                className="rounded p-1 text-ink-soft hover:text-ink hover:bg-surface-3"
                data-testid="record-fix-mic"
              >
                <RefreshCw size={11} />
              </button>
            )}
          </div>
        </>
      )}

      {props.error && (
        <div className="text-xs text-accent" data-testid="record-error">
          {props.error}
        </div>
      )}
      {recording && !props.hasMic && props.micError && (
        <div
          className="text-[11px] text-accent max-w-[280px] leading-snug"
          data-testid="mic-warning"
        >
          {props.micError}
        </div>
      )}
      {recording && !props.hasSystem && props.systemError && (
        <div
          className="text-[11px] text-accent max-w-[280px] leading-snug"
          data-testid="system-audio-warning"
        >
          {props.systemError}
        </div>
      )}
    </div>
  );
}

/**
 * Three-layer pulsing dot used for the "live recording" affordance — solid
 * white center, accent ring scale-pulsing outward (`pulse-soft` keyframe in
 * tokens.css), soft outer bloom via box-shadow. Layout sits inside an
 * 8px square so the surrounding flex layout doesn't shift when it pulses.
 * The `prefers-reduced-motion` guard in global.css freezes the ring at
 * scale 1 so the dot stays visible but stops moving.
 */
export function RedDot({ tone = 'on-record' }: { tone?: 'on-record' | 'on-page' }) {
  // `on-record` lives inside the red record button — center is white,
  // pulse uses on-button alpha. `on-page` lives inline in the meeting
  // top bar — center uses --accent so it reads on warm paper.
  const center = tone === 'on-record' ? 'oklch(99% 0 0)' : 'oklch(var(--accent))';
  const ring = tone === 'on-record'
    ? 'oklch(99% 0 0 / 0.55)'
    : 'oklch(var(--accent) / 0.45)';
  const bloom = tone === 'on-record'
    ? '0 0 8px oklch(99% 0 0 / 0.4)'
    : '0 0 12px oklch(var(--accent) / 0.4)';
  return (
    <span className="relative inline-flex h-2 w-2 items-center justify-center align-middle">
      <span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background: ring,
          animation: 'pulse-soft 1.6s var(--ease-out-soft) infinite',
        }}
      />
      <span
        className="relative inline-block h-2 w-2 rounded-full"
        style={{ background: center, boxShadow: bloom }}
      />
    </span>
  );
}

function Meter({
  icon,
  label,
  level,
  active,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  level: number;
  active: boolean;
  tooltip?: string;
}) {
  const width = Math.max(0, Math.min(1, level)) * 100;
  return (
    <div
      className={`flex items-center gap-1.5 text-[11px] ${
        active ? 'text-ink-muted' : 'text-ink-soft opacity-50'
      }`}
      title={tooltip ?? (active ? `${label} active` : `${label} not connected`)}
    >
      {icon}
      <span className="w-9">{label}</span>
      <div
        className="h-1.5 w-16 overflow-hidden rounded-full"
        style={{ background: 'oklch(var(--surface-3))' }}
      >
        <div
          className="h-full transition-[width] duration-100"
          style={{
            width: `${width}%`,
            background:
              label === 'You'
                ? 'oklch(var(--moss))'
                : 'oklch(var(--ink-muted))',
          }}
        />
      </div>
    </div>
  );
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
