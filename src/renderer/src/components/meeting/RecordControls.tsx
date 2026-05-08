import { Mic, Speaker, Square, Loader2 } from 'lucide-react';

interface RecordControlsProps {
  state: 'idle' | 'starting' | 'recording' | 'stopping' | 'error';
  error: string | null;
  hasMic: boolean;
  hasSystem: boolean;
  micLevel: number;
  systemLevel: number;
  elapsedMs: number;
  onStart: () => void;
  onStop: () => void;
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
          {props.state === 'starting' ? 'Starting…' : 'Start recording'}
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
          <Meter
            icon={<Speaker size={11} />}
            label="System"
            level={props.systemLevel}
            active={props.hasSystem}
          />
          <Meter
            icon={<Mic size={11} />}
            label="You"
            level={props.micLevel}
            active={props.hasMic}
          />
        </>
      )}

      {props.error && (
        <div className="text-xs text-accent" data-testid="record-error">
          {props.error}
        </div>
      )}
    </div>
  );
}

function RedDot() {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ background: 'oklch(99% 0 0)' }}
    />
  );
}

function Meter({
  icon,
  label,
  level,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  level: number;
  active: boolean;
}) {
  const width = Math.max(0, Math.min(1, level)) * 100;
  return (
    <div
      className={`flex items-center gap-1.5 text-[11px] ${
        active ? 'text-ink-muted' : 'text-ink-soft opacity-50'
      }`}
      title={active ? `${label} active` : `${label} not connected`}
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
