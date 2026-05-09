import { useEffect, useState } from 'react';
import { FileText, Pencil, Plus, Trash2, Wand2 } from 'lucide-react';
import type { Recipe, Template } from '@shared/types.js';
import { TemplateForm } from '../components/templates/TemplateForm';
import { RecipeForm } from '../components/templates/RecipeForm';
import { BREAKPOINTS, useMediaQuery } from '../hooks/useMediaQuery';

type Tab = 'templates' | 'recipes';
type Mode = 'view' | 'new' | 'edit';

export function TemplatesRoute() {
  const [tab, setTab] = useState<Tab>('templates');

  return (
    <div className="relative grid h-full grid-rows-[auto_1fr] pt-9">
      <div className="flex items-center gap-1 border-b hairline px-5 pt-2 pb-2">
        <TabPill active={tab === 'templates'} onClick={() => setTab('templates')}>
          <FileText size={12} /> Templates
        </TabPill>
        <TabPill active={tab === 'recipes'} onClick={() => setTab('recipes')}>
          <Wand2 size={12} /> Recipes
        </TabPill>
      </div>
      {tab === 'templates' ? <TemplatesPane /> : <RecipesPane />}
    </div>
  );
}

interface PickerItem {
  id: string;
  primary: string;
  secondary?: string;
  custom?: boolean;
  testid: string;
}

function NarrowPicker({
  label,
  newLabel,
  newTestid,
  onNew,
  items,
  activeId,
  onPick,
}: {
  label: string;
  newLabel: string;
  newTestid: string;
  onNew: () => void;
  items: PickerItem[];
  activeId: string | null;
  onPick: (id: string) => void;
}) {
  // Horizontal scroll strip for picking templates / recipes when the window
  // is too narrow for a sidebar. Each item is a pill with a moss underline
  // when active. The "New" button anchors at the right edge.
  return (
    <div className="surface-2 border-b hairline">
      <div className="flex items-center justify-between px-5 pt-3 pb-1">
        <span className="text-[11px] uppercase tracking-wider text-ink-soft">
          {label}
        </span>
        <button
          onClick={onNew}
          className="btn btn-ghost text-xs px-2"
          aria-label={newLabel}
          data-testid={newTestid}
        >
          <Plus size={13} /> New
        </button>
      </div>
      <div className="scroll-thin overflow-x-auto px-3 pb-3">
        <div className="flex items-center gap-1.5 min-w-max">
          {items.map((it) => {
            const active = activeId === it.id;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onPick(it.id)}
                data-testid={it.testid}
                className={`flex items-baseline gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors whitespace-nowrap border-b-2 ${
                  active
                    ? 'bg-surface-3 text-ink border-b-moss'
                    : 'text-ink-muted hover:bg-surface-3 hover:text-ink border-b-transparent'
                }`}
              >
                {it.secondary && (
                  <span className="font-mono text-[10.5px] text-moss">
                    {it.secondary}
                  </span>
                )}
                <span className="font-medium">{it.primary}</span>
                {it.custom && (
                  <span
                    className="text-[9px] uppercase tracking-wider"
                    style={{ color: 'oklch(var(--moss))' }}
                  >
                    custom
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TabPill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
        active ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:bg-surface-3 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function TemplatesPane() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [active, setActive] = useState<Template | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const narrow = useMediaQuery(BREAKPOINTS.narrowBody);

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
    <div
      className={
        narrow
          ? 'grid h-full grid-rows-[auto_1fr] min-h-0'
          : 'grid h-full grid-cols-[minmax(180px,260px)_1fr] min-h-0'
      }
    >
      {narrow ? (
        <NarrowPicker
          label="Templates"
          newLabel="New template"
          newTestid="template-new"
          onNew={startNew}
          items={templates.map((t) => ({
            id: t.id,
            primary: t.name,
            custom: !t.builtIn,
            testid: `template-pick-${t.id}`,
          }))}
          activeId={active?.id ?? null}
          onPick={(id) => {
            const t = templates.find((x) => x.id === id);
            if (t) {
              setActive(t);
              setMode('view');
            }
          }}
        />
      ) : (
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
                  className={`block w-full text-left py-2 pl-3 pr-2 text-sm transition-colors border-l-[3px] -ml-2 ${
                    active?.id === t.id && mode === 'view'
                      ? 'border-moss text-ink font-medium bg-surface-3/40'
                      : 'border-transparent text-ink-muted hover:bg-surface-3 hover:text-ink'
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
      )}

      <div className="overflow-y-auto px-5 sm:px-10 py-8 scroll-thin">
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

function RecipesPane() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [active, setActive] = useState<Recipe | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const narrow = useMediaQuery(BREAKPOINTS.narrowBody);

  const refresh = async (selectId?: string) => {
    const list = await window.quill.recipes.list();
    setRecipes(list);
    const next =
      list.find((r) => r.id === selectId) ??
      list.find((r) => r.id === active?.id) ??
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

  const save = async (r: Recipe) => {
    await window.quill.recipes.save(r);
    setMode('view');
    await refresh(r.id);
  };

  const remove = async () => {
    if (!active || active.builtIn) return;
    if (!window.confirm(`Delete recipe "${active.name}"?`)) return;
    await window.quill.recipes.delete(active.id);
    await refresh();
  };

  return (
    <div
      className={
        narrow
          ? 'grid h-full grid-rows-[auto_1fr] min-h-0'
          : 'grid h-full grid-cols-[minmax(180px,260px)_1fr] min-h-0'
      }
    >
      {narrow ? (
        <NarrowPicker
          label="Recipes"
          newLabel="New recipe"
          newTestid="recipe-new"
          onNew={startNew}
          items={recipes.map((r) => ({
            id: r.id,
            primary: r.name,
            secondary: `/${r.trigger}`,
            custom: !r.builtIn,
            testid: `recipe-pick-${r.id}`,
          }))}
          activeId={active?.id ?? null}
          onPick={(id) => {
            const r = recipes.find((x) => x.id === id);
            if (r) {
              setActive(r);
              setMode('view');
            }
          }}
        />
      ) : (
        <aside className="surface-2 border-r hairline overflow-y-auto scroll-thin flex flex-col">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <span className="text-[11px] uppercase tracking-wider text-ink-soft">
              Recipes
            </span>
            <button
              onClick={startNew}
              className="btn btn-ghost text-xs px-2"
              aria-label="New recipe"
              data-testid="recipe-new"
            >
              <Plus size={13} /> New
            </button>
          </div>
          <ul className="px-2 pb-2 flex-1">
            {recipes.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => {
                    setActive(r);
                    setMode('view');
                  }}
                  className={`block w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                    active?.id === r.id && mode === 'view'
                      ? 'bg-surface-3 text-ink'
                      : 'text-ink-muted hover:bg-surface-3 hover:text-ink'
                  }`}
                  data-testid={`recipe-pick-${r.id}`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Wand2 size={12} className="opacity-60" />
                    <span className="font-mono text-xs text-moss">/{r.trigger}</span>
                    <span>{r.name}</span>
                    {!r.builtIn && (
                      <span
                        className="ml-auto text-[10px] uppercase tracking-wider"
                        style={{ color: 'oklch(var(--moss))' }}
                      >
                        custom
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-soft line-clamp-2">
                    {r.description}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <div className="overflow-y-auto px-5 sm:px-10 py-8 scroll-thin">
        {mode === 'new' && (
          <article>
            <h1
              className="font-serif text-3xl tracking-tight mb-6"
              style={{ letterSpacing: '-0.022em' }}
            >
              New recipe
            </h1>
            <RecipeForm initial={null} onSave={save} onCancel={cancel} />
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
            <RecipeForm initial={active} onSave={save} onCancel={cancel} />
          </article>
        )}

        {mode === 'view' && active && (
          <article>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-ink-soft mb-2">
                  {active.builtIn ? 'Built-in' : 'Custom'} · {active.scope}
                </div>
                <h1
                  className="flex items-baseline gap-3 font-serif text-3xl tracking-tight"
                  style={{ letterSpacing: '-0.022em' }}
                >
                  <span className="font-mono text-xl text-moss">/{active.trigger}</span>
                  <span>{active.name}</span>
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
                Prompt
              </h2>
              <pre className="whitespace-pre-wrap rounded-md surface-2 p-4 font-mono text-[12.5px] leading-relaxed">
                {active.prompt}
              </pre>
            </section>
          </article>
        )}
      </div>
    </div>
  );
}
