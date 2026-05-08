import { useEffect, useState } from 'react';
import type { Template } from '@shared/types.js';

interface TemplateFormProps {
  initial: Template | null;
  onSave: (t: Template) => Promise<void>;
  onCancel: () => void;
}

const STARTER_BODY = `## Section
Describe what should appear here.

## Action items
- [ ] {item} — {owner}
`;

const STARTER_SYSTEM = `You are a meeting scribe. Stay grounded in the source material; do not invent facts. Use the section structure that follows. Output only the structured markdown.`;

export function TemplateForm({ initial, onSave, onCancel }: TemplateFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(
    initial?.systemPrompt ?? STARTER_SYSTEM,
  );
  const [body, setBody] = useState(initial?.body ?? STARTER_BODY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setDescription(initial.description);
      setSystemPrompt(initial.systemPrompt);
      setBody(initial.body);
    }
  }, [initial?.id]);

  const valid = name.trim().length > 0 && systemPrompt.trim().length > 10 && body.trim().length > 10;

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const id =
        initial?.id ??
        `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${Date.now().toString(36)}`;
      await onSave({
        id,
        name: name.trim(),
        description: description.trim(),
        systemPrompt: systemPrompt.trim(),
        body: body.trim(),
        builtIn: false,
        createdAt: initial?.createdAt ?? new Date().toISOString(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-ink-soft mb-1.5">
          Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Weekly retro"
          className="input"
          data-testid="template-name"
        />
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-wider text-ink-soft mb-1.5">
          Short description
        </label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this template is for"
          className="input"
          data-testid="template-description"
        />
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-wider text-ink-soft mb-1.5">
          System prompt — how the AI should behave
        </label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={6}
          className="input font-mono text-[12.5px] leading-relaxed"
          data-testid="template-system"
        />
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-wider text-ink-soft mb-1.5">
          Output structure — the markdown skeleton
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          className="input font-mono text-[12.5px] leading-relaxed"
          data-testid="template-body"
        />
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={submit}
          disabled={!valid || saving}
          className="btn btn-primary disabled:opacity-50"
          data-testid="template-save"
        >
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Create template'}
        </button>
        <button onClick={onCancel} className="btn btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}
