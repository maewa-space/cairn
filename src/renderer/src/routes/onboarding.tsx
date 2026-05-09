import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, Mic, Sparkles, Volume2 } from 'lucide-react';
import { Masthead } from '../components/Masthead';
import { formatIssueDate } from '../lib/issue';

type Step = 'intro' | 'permissions' | 'keys';

export function OnboardingRoute() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>('intro');
  const [openaiInput, setOpenaiInput] = useState('');
  const [openrouterInput, setOpenrouterInput] = useState('');
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    setSaving(true);
    try {
      if (openaiInput.trim()) {
        await window.quill.keys.set('openai', openaiInput.trim());
      }
      if (openrouterInput.trim()) {
        await window.quill.keys.set('openrouter', openrouterInput.trim());
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
      <div className="mx-auto max-w-2xl px-5 sm:px-10 py-8">
        <Masthead left="Quill — Issue Zero" right={formatIssueDate()} />

        {step === 'intro' && (
          <section data-testid="onboarding-intro">
            <div className="eyebrow mb-3">Welcome — Step 1 of 3</div>
            <h1
              className="font-serif text-[clamp(2.25rem,1.4rem+2vw,3rem)] tracking-tight leading-[1.05]"
              style={{ letterSpacing: '-0.024em' }}
            >
              Note every meeting.<br />
              <span className="italic text-ink-muted">Polish it later.</span>
            </h1>
            <p className="mt-5 text-ink-muted leading-relaxed max-w-prose">
              Quill listens to your computer's audio and your microphone,
              transcribes the conversation, and turns rough notes into a clean
              writeup. <span className="italic">No bot joins your call.</span>{' '}
              Audio is discarded after each chunk — only the transcript stays.
            </p>

            <ul className="mt-8">
              <Bullet
                icon={<Volume2 size={18} strokeWidth={1.6} />}
                title="Two streams, one transcript"
                body="System audio (the other side) and your microphone, captured in parallel and tagged so you always know who said what."
              />
              <Bullet
                icon={<Sparkles size={18} strokeWidth={1.6} />}
                title="Templates that match the meeting"
                body="Customer Discovery, User Interview, Pitch, Stand-up, 1-on-1 — plus your own. Slash-recipes for in-the-moment prompts."
              />
              <Bullet
                icon={<KeyRound size={18} strokeWidth={1.6} />}
                title="Your keys, your data"
                body="Keys live encrypted in macOS Keychain. Transcripts and notes stay in a local SQLite file you can grep."
              />
            </ul>

            <div className="mt-10">
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
            <div className="eyebrow mb-3">Step 2 of 3</div>
            <h1
              className="font-serif text-[clamp(1.75rem,1.2rem+1.4vw,2.5rem)] tracking-tight leading-tight"
              style={{ letterSpacing: '-0.022em' }}
            >
              macOS will ask twice.
            </h1>
            <p className="mt-4 text-ink-muted leading-relaxed max-w-prose">
              When you start your first meeting, macOS prompts for two permissions.
              Grant the first to capture your voice, the second to capture the other
              side. Quill never records video — it just needs the audio stream.
            </p>

            <div className="mt-6">
              <PermCard
                icon={<Mic size={18} strokeWidth={1.6} />}
                title="Microphone"
                body="Captures your voice. Asked at the moment you press Record."
              />
              <PermCard
                icon={<Volume2 size={18} strokeWidth={1.6} />}
                title="System Audio Recording"
                body="Captures the other side of the call (Zoom / Meet / Teams audio). Quill uses Apple's Core Audio Tap via the AudioTee binary — no Screen Recording, no video. On macOS Sequoia and later, you'll find it under Privacy & Security → Screen & System Audio Recording → System Audio Recording Only."
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
            <div className="eyebrow mb-3">Step 3 of 3</div>
            <h1
              className="font-serif text-[clamp(1.75rem,1.2rem+1.4vw,2.5rem)] tracking-tight leading-tight"
              style={{ letterSpacing: '-0.022em' }}
            >
              Bring your own keys.
            </h1>
            <p className="mt-4 text-ink-muted leading-relaxed max-w-prose">
              Quill is BYO-key — nothing goes through our servers because there
              are no servers. <strong className="text-ink font-medium">OpenAI</strong> handles the
              Whisper transcription; <strong className="text-ink font-medium">OpenRouter</strong> handles
              the cheap Claude Haiku route for chat &amp; note enhancement.
              Both encrypted in macOS Keychain.
            </p>

            <div className="mt-7 space-y-5">
              <KeyEntry
                title="OpenAI"
                hint="Required · Whisper transcription"
                placeholder="sk-..."
                value={openaiInput}
                setValue={setOpenaiInput}
                testId="onboarding-key-openai"
              />
              <KeyEntry
                title="OpenRouter"
                hint="Recommended · cheap Haiku for chat + enhance"
                placeholder="sk-or-..."
                value={openrouterInput}
                setValue={setOpenrouterInput}
                testId="onboarding-key-openrouter"
              />
            </div>
            <p className="dateline mt-4">
              Anthropic key (full Sonnet) optional — add it later in Settings.
            </p>

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
  // Editorial bullet — icon at full size in moss, small-caps eyebrow label
  // beside it, body beneath. Hairline rule above each row gives the list
  // the rhythm of a section in a journal.
  return (
    <li className="pt-3 first:pt-0">
      <div className="rule mb-3 first-child:hidden" />
      <div className="flex gap-3 items-start">
        <span className="mt-1 shrink-0 text-moss">{icon}</span>
        <div className="flex-1">
          <div className="font-serif text-base leading-tight" style={{ fontWeight: 500 }}>
            {title}
          </div>
          <p className="text-sm text-ink-muted leading-relaxed mt-1 max-w-prose">
            {body}
          </p>
        </div>
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
  // Same vocabulary as Bullet — full-size moss icon, serif title, body
  // beneath, separated by a hairline. No rounded card box; the rule does
  // the structural work.
  return (
    <div className="pt-4 first:pt-0">
      <div className="rule mb-4" />
      <div className="flex gap-3 items-start">
        <span className="mt-1 shrink-0 text-moss">{icon}</span>
        <div className="flex-1">
          <div className="font-serif text-base leading-tight" style={{ fontWeight: 500 }}>
            {title}
          </div>
          <p className="text-sm text-ink-muted leading-relaxed mt-1 max-w-prose">
            {body}
          </p>
        </div>
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
      <div className="flex items-baseline justify-between gap-3">
        <label
          className="font-serif text-base"
          style={{ fontWeight: 500, letterSpacing: '-0.012em' }}
        >
          {title}
        </label>
        <span className="dateline">{hint}</span>
      </div>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="input mt-2"
        data-testid={testId}
      />
    </div>
  );
}
