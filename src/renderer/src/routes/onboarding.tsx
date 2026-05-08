import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Feather, KeyRound, Mic, Monitor, Sparkles } from 'lucide-react';

type Step = 'intro' | 'permissions' | 'keys';

export function OnboardingRoute() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>('intro');
  const [openaiInput, setOpenaiInput] = useState('');
  const [anthropicInput, setAnthropicInput] = useState('');
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    setSaving(true);
    try {
      if (openaiInput.trim()) {
        await window.quill.keys.set('openai', openaiInput.trim());
      }
      if (anthropicInput.trim()) {
        await window.quill.keys.set('anthropic', anthropicInput.trim());
      }
      sessionStorage.setItem('quill.onboarded', '1');
    } finally {
      setSaving(false);
      nav('/home');
    }
  };

  const skip = () => {
    sessionStorage.setItem('quill.onboarded', '1');
    nav('/home');
  };

  return (
    <div className="relative h-full overflow-y-auto pt-12">
      <div className="mx-auto max-w-2xl px-10 py-8">
        <div className="flex items-center gap-2 text-moss mb-8">
          <Feather size={18} strokeWidth={1.6} />
          <span className="font-serif text-lg tracking-tight">Quill</span>
        </div>

        {step === 'intro' && (
          <section data-testid="onboarding-intro">
            <div className="text-xs uppercase tracking-[0.18em] text-ink-soft mb-2">
              Welcome
            </div>
            <h1
              className="font-serif text-[clamp(2rem,1.4rem+1.6vw,2.75rem)] tracking-tight leading-tight"
              style={{ letterSpacing: '-0.022em' }}
            >
              A quiet notetaker for your meetings.
            </h1>
            <p className="mt-4 text-ink-muted leading-relaxed max-w-prose">
              Quill listens to your computer's audio and your microphone, transcribes
              the conversation locally to your machine, and turns your rough notes
              into a structured writeup. No bots join your call. No recordings stay
              on disk.
            </p>

            <ul className="mt-6 space-y-3">
              <Bullet
                icon={<Monitor size={14} />}
                title="System audio + microphone"
                body="Two parallel streams, tagged so you always know who said what."
              />
              <Bullet
                icon={<Sparkles size={14} />}
                title="Templates that match the meeting"
                body="Customer Discovery, User Interview, Pitch, Stand-up, 1-on-1, and your own."
              />
              <Bullet
                icon={<KeyRound size={14} />}
                title="Your keys, your data"
                body="API keys live in macOS Keychain. The transcript and notes stay in a local SQLite file."
              />
            </ul>

            <div className="mt-9">
              <button
                onClick={() => setStep('permissions')}
                className="btn btn-primary"
                data-testid="onboarding-next-permissions"
              >
                Continue <ArrowRight size={13} />
              </button>
            </div>
          </section>
        )}

        {step === 'permissions' && (
          <section data-testid="onboarding-permissions">
            <div className="text-xs uppercase tracking-[0.18em] text-ink-soft mb-2">
              Step 2 of 3
            </div>
            <h1
              className="font-serif text-[clamp(1.75rem,1.2rem+1.4vw,2.5rem)] tracking-tight leading-tight"
              style={{ letterSpacing: '-0.022em' }}
            >
              macOS will ask twice.
            </h1>
            <p className="mt-4 text-ink-muted leading-relaxed max-w-prose">
              The first time you record, macOS prompts for two permissions. Both are
              required for Quill to do its job; deny them and Quill simply can't
              capture anything.
            </p>

            <div className="mt-6 space-y-3">
              <PermCard
                icon={<Mic size={14} />}
                title="Microphone"
                body="So your voice can be transcribed in the same conversation as the other side."
              />
              <PermCard
                icon={<Monitor size={14} />}
                title="Screen Recording"
                body="macOS routes system audio through ScreenCaptureKit, which lives behind the Screen Recording permission. Quill never touches the video — only the audio track."
              />
            </div>

            <div className="mt-9 flex items-center gap-2">
              <button
                onClick={() => setStep('intro')}
                className="btn btn-ghost"
              >
                Back
              </button>
              <button
                onClick={() => setStep('keys')}
                className="btn btn-primary"
                data-testid="onboarding-next-keys"
              >
                Got it <ArrowRight size={13} />
              </button>
            </div>
          </section>
        )}

        {step === 'keys' && (
          <section data-testid="onboarding-keys">
            <div className="text-xs uppercase tracking-[0.18em] text-ink-soft mb-2">
              Step 3 of 3
            </div>
            <h1
              className="font-serif text-[clamp(1.75rem,1.2rem+1.4vw,2.5rem)] tracking-tight leading-tight"
              style={{ letterSpacing: '-0.022em' }}
            >
              Bring your own keys.
            </h1>
            <p className="mt-4 text-ink-muted leading-relaxed max-w-prose">
              Quill needs an OpenAI key for Whisper transcription. Add an Anthropic
              key too if you want Claude to handle note enhancement (better
              instruction-following, prompt-cached on the template). Both are stored
              encrypted via macOS Keychain.
            </p>

            <div className="mt-6 space-y-4">
              <KeyEntry
                title="OpenAI key"
                hint="Required — used for Whisper transcription."
                placeholder="sk-..."
                value={openaiInput}
                setValue={setOpenaiInput}
                testId="onboarding-key-openai"
              />
              <KeyEntry
                title="Anthropic key"
                hint="Optional — preferred for note enhancement."
                placeholder="sk-ant-..."
                value={anthropicInput}
                setValue={setAnthropicInput}
                testId="onboarding-key-anthropic"
              />
            </div>

            <div className="mt-9 flex items-center gap-2">
              <button
                onClick={() => setStep('permissions')}
                className="btn btn-ghost"
              >
                Back
              </button>
              <button
                onClick={finish}
                disabled={saving || openaiInput.trim().length === 0}
                className="btn btn-primary disabled:opacity-50"
                data-testid="onboarding-finish"
              >
                {saving ? 'Saving…' : 'Open Quill'} <ArrowRight size={13} />
              </button>
              <button
                onClick={skip}
                className="btn btn-ghost text-xs ml-auto"
                data-testid="onboarding-skip"
              >
                Skip for now
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Bullet({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: 'oklch(var(--moss) / 0.15)', color: 'oklch(var(--moss))' }}
      >
        {icon}
      </span>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-sm text-ink-muted">{body}</div>
      </div>
    </li>
  );
}

function PermCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="card p-4 flex gap-3">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: 'oklch(var(--moss) / 0.15)', color: 'oklch(var(--moss))' }}
      >
        {icon}
      </span>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-sm text-ink-muted leading-snug mt-0.5">{body}</div>
      </div>
    </div>
  );
}

function KeyEntry({
  title,
  hint,
  placeholder,
  value,
  setValue,
  testId,
}: {
  title: string;
  hint: string;
  placeholder: string;
  value: string;
  setValue: (v: string) => void;
  testId: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{title}</label>
        <span className="text-[11px] text-ink-soft">{hint}</span>
      </div>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="input mt-1.5"
        data-testid={testId}
      />
    </div>
  );
}
