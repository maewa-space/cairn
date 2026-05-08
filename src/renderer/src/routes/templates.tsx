import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import type { Template } from '@shared/types.js';

export function TemplatesRoute() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [active, setActive] = useState<Template | null>(null);

  useEffect(() => {
    window.cairn.templates.list().then((list) => {
      setTemplates(list);
      setActive(list[0] ?? null);
    });
  }, []);

  return (
    <div className="relative grid h-full grid-cols-[280px_1fr] pt-9">
      <aside className="surface-2 border-r hairline overflow-y-auto scroll-thin">
        <div className="px-5 pt-4 pb-2 text-[11px] uppercase tracking-wider text-ink-soft">
          Templates
        </div>
        <ul className="px-2 pb-2">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setActive(t)}
                className={`block w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                  active?.id === t.id
                    ? 'bg-surface-3 text-ink'
                    : 'text-ink-muted hover:bg-surface-3 hover:text-ink'
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  <FileText size={12} className="opacity-60" /> {t.name}
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
        {active && (
          <article>
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-soft mb-2">
              {active.builtIn ? 'Built-in' : 'Custom'}
            </div>
            <h1 className="font-serif text-3xl tracking-tight" style={{ letterSpacing: '-0.022em' }}>
              {active.name}
            </h1>
            <p className="mt-2 text-ink-muted">{active.description}</p>

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
