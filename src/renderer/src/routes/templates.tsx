import { useEffect, useState } from 'react';
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Template } from '@shared/types.js';
import { TemplateForm } from '../components/templates/TemplateForm';

type Mode = 'view' | 'new' | 'edit';

export function TemplatesRoute() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [active, setActive] = useState<Template | null>(null);
  const [mode, setMode] = useState<Mode>('view');

  const refresh = async (selectId?: string) => {
    const list = await window.quill.templates.list();
    setTemplates(list);
    const next =
      list.find((t) => t.id === selectId) ??
      list.find((t) => t.id === active?.id) ??
      list[0] ??
      null;
    setActive(next);
  };

  useEffect(() => {
    refresh();
  }, []);

  const startNew = () => {
    setActive(null);
    setMode('new');
  };
  const startEdit = () => {
    if (!active || active.builtIn) return;
    setMode('edit');
  };
  const cancel = () => setMode('view');

  const save = async (t: Template) => {
    await window.quill.templates.save(t);
    setMode('view');
    await refresh(t.id);
  };

  const remove = async () => {
    if (!active || active.builtIn) return;
    if (!window.confirm(`Delete template "${active.name}"?`)) return;
    await window.quill.templates.delete(active.id);
    await refresh();
  };

  return (
    <div className="relative grid h-full grid-cols-[300px_1fr] pt-9">
      <aside className="surface-2 border-r hairline overflow-y-auto scroll-thin flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span className="text-[11px] uppercase tracking-wider text-ink-soft">
            Templates
          </span>
          <button
            onClick={startNew}
            className="btn btn-ghost text-xs px-2"
            aria-label="New template"
            data-testid="template-new"
          >
            <Plus size={13} /> New
          </button>
        </div>
        <ul className="px-2 pb-2 flex-1">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => {
                  setActive(t);
                  setMode('view');
                }}
                className={`block w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                  active?.id === t.id && mode === 'view'
                    ? 'bg-surface-3 text-ink'
                    : 'text-ink-muted hover:bg-surface-3 hover:text-ink'
                }`}
                data-testid={`template-pick-${t.id}`}
              >
                <div className="flex items-center gap-2 font-medium">
                  <FileText size={12} className="opacity-60" /> {t.name}
                  {!t.builtIn && (
                    <span
                      className="ml-auto text-[10px] uppercase tracking-wider"
                      style={{ color: 'oklch(var(--moss))' }}
                    >
                      custom
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-ink-soft line-clamp-2">
                  {t.description}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="overflow-y-auto px-10 py-8 scroll-thin">
        {mode === 'new' && (
          <article>
            <h1
              className="font-serif text-3xl tracking-tight mb-6"
              style={{ letterSpacing: '-0.022em' }}
            >
              New template
            </h1>
            <TemplateForm initial={null} onSave={save} onCancel={cancel} />
          </article>
        )}

        {mode === 'edit' && active && (
          <article>
            <h1
              className="font-serif text-3xl tracking-tight mb-6"
              style={{ letterSpacing: '-0.022em' }}
            >
              Edit {active.name}
            </h1>
            <TemplateForm initial={active} onSave={save} onCancel={cancel} />
          </article>
        )}

        {mode === 'view' && active && (
          <article>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-ink-soft mb-2">
                  {active.builtIn ? 'Built-in' : 'Custom'}
                </div>
                <h1
                  className="font-serif text-3xl tracking-tight"
                  style={{ letterSpacing: '-0.022em' }}
                >
                  {active.name}
                </h1>
                <p className="mt-2 text-ink-muted max-w-prose">
                  {active.description}
                </p>
              </div>
              {!active.builtIn && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={startEdit} className="btn btn-secondary text-xs">
                    <Pencil size={12} /> Edit
                  </button>
                  <button onClick={remove} className="btn btn-ghost text-xs">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              )}
            </div>

            <section className="mt-8">
              <h2 className="text-[11px] uppercase tracking-wider text-ink-soft mb-2">
                System prompt
              </h2>
              <pre className="whitespace-pre-wrap rounded-md surface-2 p-4 font-mono text-[12.5px] leading-relaxed">
                {active.systemPrompt}
              </pre>
            </section>

            <section className="mt-6">
              <h2 className="text-[11px] uppercase tracking-wider text-ink-soft mb-2">
                Output structure
              </h2>
              <pre className="whitespace-pre-wrap rounded-md surface-2 p-4 font-mono text-[12.5px] leading-relaxed">
                {active.body}
              </pre>
            </section>
          </article>
        )}
      </div>
    </div>
  );
}
