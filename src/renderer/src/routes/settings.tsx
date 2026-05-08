import { useEffect, useState } from 'react';
import { Check, KeyRound, Trash2 } from 'lucide-react';

export function SettingsRoute() {
  const [openaiSet, setOpenaiSet] = useState(false);
  const [anthropicSet, setAnthropicSet] = useState(false);
  const [openaiInput, setOpenaiInput] = useState('');
  const [anthropicInput, setAnthropicInput] = useState('');
  const [savingOpenai, setSavingOpenai] = useState(false);
  const [savingAnthropic, setSavingAnthropic] = useState(false);

  const refresh = async () => {
    setOpenaiSet(await window.quill.keys.has('openai'));
    setAnthropicSet(await window.quill.keys.has('anthropic'));
  };

  useEffect(() => {
    refresh();
  }, []);

  const saveKey = async (
    name: 'openai' | 'anthropic',
    value: string,
    setSaving: (v: boolean) => void,
    clearInput: () => void,
  ) => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await window.quill.keys.set(name, value.trim());
      clearInput();
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const removeKey = async (name: 'openai' | 'anthropic') => {
    await window.quill.keys.delete(name);
    await refresh();
  };

  return (
    <div className="relative h-full overflow-y-auto pt-12">
      <div className="mx-auto max-w-2xl px-10 py-8">
        <h1 className="font-serif text-3xl tracking-tight" style={{ letterSpacing: '-0.022em' }}>
          Settings
        </h1>
        <p className="mt-2 text-ink-muted">
          Bring your own API keys. Keys are encrypted via macOS Keychain (Electron <code>safeStorage</code>) and never leave this machine.
        </p>

        <section className="mt-10 space-y-8">
          <KeyCard
            title="OpenAI"
            description="Used for Whisper transcription and (optionally) note enhancement."
            placeholder="sk-..."
            isSet={openaiSet}
            value={openaiInput}
            setValue={setOpenaiInput}
            saving={savingOpenai}
            onSave={() =>
              saveKey('openai', openaiInput, setSavingOpenai, () => setOpenaiInput(''))
            }
            onRemove={() => removeKey('openai')}
          />
          <KeyCard
            title="Anthropic"
            description="Preferred for note enhancement (Claude Sonnet, with prompt caching on the template)."
            placeholder="sk-ant-..."
            isSet={anthropicSet}
            value={anthropicInput}
            setValue={setAnthropicInput}
            saving={savingAnthropic}
            onSave={() =>
              saveKey(
                'anthropic',
                anthropicInput,
                setSavingAnthropic,
                () => setAnthropicInput(''),
              )
            }
            onRemove={() => removeKey('anthropic')}
          />
        </section>

        <section className="mt-12 text-sm text-ink-muted">
          <h2 className="text-[11px] uppercase tracking-wider text-ink-soft mb-2">
            About
          </h2>
          <p>
            Quill captures your microphone via <code>getUserMedia</code> and your computer's
            audio output via <code>getDisplayMedia</code> with system audio. macOS will ask
            for Microphone and Screen Recording permissions the first time you record.
            Audio is sent to OpenAI Whisper in 20-second chunks and discarded after each
            chunk — only the resulting transcript is stored.
          </p>
        </section>
      </div>
    </div>
  );
}

function KeyCard(props: {
  title: string;
  description: string;
  placeholder: string;
  isSet: boolean;
  value: string;
  setValue: (v: string) => void;
  saving: boolean;
  onSave: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-base font-medium">
            <KeyRound size={14} className="text-moss" />
            {props.title}
            {props.isSet && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
                    style={{
                      background: 'oklch(var(--moss) / 0.15)',
                      color: 'oklch(var(--moss))',
                    }}>
                <Check size={10} strokeWidth={3} /> stored
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-ink-muted">{props.description}</div>
        </div>
        {props.isSet && (
          <button
            onClick={props.onRemove}
            className="btn btn-ghost text-xs"
            aria-label="Remove key"
          >
            <Trash2 size={12} /> Remove
          </button>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={props.placeholder}
          value={props.value}
          onChange={(e) => props.setValue(e.target.value)}
          className="input flex-1"
          data-testid={`key-input-${props.title.toLowerCase()}`}
        />
        <button
          onClick={props.onSave}
          disabled={!props.value || props.saving}
          className="btn btn-primary disabled:opacity-50"
        >
          {props.saving ? 'Saving…' : props.isSet ? 'Replace' : 'Save'}
        </button>
      </div>
    </div>
  );
}
