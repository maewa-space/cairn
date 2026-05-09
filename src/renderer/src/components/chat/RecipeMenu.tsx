import { useEffect, useRef } from 'react';
import { animate } from 'motion';
import type { Recipe } from '@shared/types.js';

interface RecipeMenuProps {
  recipes: Recipe[];
  query: string;
  activeIndex: number;
  onPick: (recipe: Recipe) => void;
  onHover: (index: number) => void;
}

export function RecipeMenu({
  recipes,
  query,
  activeIndex,
  onPick,
  onHover,
}: RecipeMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Soft fade + slight lift from below on mount — the menu opens upward
  // from the composer, so we slide from +4 to 0. Reduced-motion guard
  // collapses the duration globally.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    animate(
      el,
      { opacity: [0, 1], y: [4, 0] },
      { duration: 0.14, ease: [0.22, 1, 0.36, 1] },
    );
  }, []);

  if (recipes.length === 0) return null;

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label="Recipes"
      data-testid="recipe-menu"
      className="absolute bottom-full left-0 mb-2 max-h-72 w-full overflow-y-auto rounded-md border bg-surface-2 shadow-lg"
      style={{
        borderColor: 'oklch(var(--edge))',
        boxShadow: '0 12px 28px -12px oklch(0% 0 0 / 0.18)',
      }}
    >
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-ink-soft border-b hairline">
        Recipes {query && <span className="lowercase">— /{query}</span>}
      </div>
      {recipes.map((r, i) => (
        <button
          key={r.id}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          data-active={i === activeIndex}
          data-testid={`recipe-pick-${r.trigger}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(r);
          }}
          onMouseEnter={() => onHover(i)}
          className={`block w-full text-left px-3 py-2 transition-colors ${
            i === activeIndex
              ? 'bg-surface-3 text-ink'
              : 'text-ink-muted hover:bg-surface-3'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-moss">/{r.trigger}</span>
            <span className="text-sm font-medium">{r.name}</span>
            <span className="ml-auto text-[10px] uppercase tracking-wider text-ink-soft">
              {r.scope}
            </span>
          </div>
          <div className="mt-0.5 text-[11.5px] text-ink-soft line-clamp-2">
            {r.description}
          </div>
        </button>
      ))}
    </div>
  );
}
