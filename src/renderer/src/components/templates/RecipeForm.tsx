import { useEffect, useState } from 'react';
import type { Recipe, RecipeScope } from '@shared/types.js';

interface RecipeFormProps {
  initial: Recipe | null;
  onSave: (r: Recipe) => Promise<void>;
  onCancel: () => void;
}

const STARTER_PROMPT = `You are helping the user with this meeting. Be specific. Ground every claim in the transcript. Output in clear markdown sections.`;

export function RecipeForm({ initial, onSave, onCancel }: RecipeFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [trigger, setTrigger] = useState(initial?.trigger ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [scope, setScope] = useState<RecipeScope>(initial?.scope ?? 'meeting');
  const [prompt, setPrompt] = useState(initial?.prompt ?? STARTER_PROMPT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setTrigger(initial.trigger);
      setDescription(initial.description);
      setScope(initial.scope);
      setPrompt(initial.prompt);
    }
  }, [initial?.id]);

  const triggerNorm = trigger
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[^a-z0-9-]/g, '');

  const valid =
    name.trim().length > 0 &&
    triggerNorm.length > 1 &&
    prompt.trim().length > 10;

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const id =
        initial?.id ??
        `custom-${triggerNorm}-${Date.now().toString(36)}`;
      await onSave({
        id,
        name: name.trim(),
        trigger: triggerNorm,
        description: description.trim(),
        scope,
        prompt: prompt.trim(),
        builtIn: false,
        createdAt: initial?.createdAt ?? new Date().toISOString(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ink-soft mb-1.5">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Pricing follow-up"
            className="input"
            data-testid="recipe-name"
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ink-soft mb-1.5">
            Trigger
          </label>
          <div className="flex items-center gap-1">
            <span className="font-mono text-sm text-ink-soft">/</span>
            <input
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder="pricing-followup"
              className="input font-mono"
              data-testid="recipe-trigger"
            />
          </div>
          {trigger && triggerNorm !== trigger && (
            <div className="mt-1 text-[11px] text-ink-soft">
              Will be saved as <span className="font-mono">/{triggerNorm}</span>
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-wider text-ink-soft mb-1.5">
          Description
        </label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this recipe does"
          className="input"
          data-testid="recipe-description"
        />
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-wider text-ink-soft mb-1.5">
          Scope
        </label>
        <div className="flex gap-2">
          <ScopePill
            label="Meeting"
            active={scope === 'meeting'}
            onClick={() => setScope('meeting')}
          />
          <ScopePill
            label="Global"
            active={scope === 'global'}
            onClick={() => setScope('global')}
          />
        </div>
        <div className="mt-1 text-[11px] text-ink-soft">
          {scope === 'meeting'
            ? 'Available inside an open meeting. Grounds in that meeting only.'
            : 'Available everywhere. Grounds in recent meetings or a folder.'}
        </div>
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-wider text-ink-soft mb-1.5">
          Prompt
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={10}
          className="input font-mono text-[12.5px] leading-relaxed"
          data-testid="recipe-prompt"
        />
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={submit}
          disabled={!valid || saving}
          className="btn btn-primary disabled:opacity-50"
          data-testid="recipe-save"
        >
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Create recipe'}
        </button>
        <button onClick={onCancel} className="btn btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ScopePill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1 text-xs transition-colors ${
        active ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:bg-surface-3 hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}
