import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Send } from 'lucide-react';
import type { Recipe, RecipeScope } from '@shared/types.js';
import { RecipeMenu } from './RecipeMenu';

export interface ComposerHandle {
  focus: () => void;
}

interface ComposerProps {
  recipes: Recipe[];
  scope: RecipeScope;
  disabled?: boolean;
  pending: boolean;
  onSend: (text: string, recipeId: string | null) => Promise<void>;
}

const SLASH_RE = /(?:^|\s)\/([a-z0-9-]*)$/i;

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { recipes, scope, disabled, pending, onSend },
  externalRef,
) {
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(externalRef, () => ({
    focus: () => taRef.current?.focus(),
  }));

  const visibleRecipes = useMemo(() => {
    const inScope = recipes.filter(
      (r) => r.scope === scope || r.scope === 'global',
    );
    const q = menuQuery.toLowerCase();
    if (!q) return inScope.slice(0, 8);
    return inScope
      .filter(
        (r) =>
          r.trigger.toLowerCase().startsWith(q) ||
          r.name.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [recipes, scope, menuQuery]);

  const updateMenuFromText = (next: string) => {
    const m = next.match(SLASH_RE);
    if (m) {
      setMenuOpen(true);
      setMenuQuery(m[1] ?? '');
      setActiveIndex(0);
    } else {
      setMenuOpen(false);
      setMenuQuery('');
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setText(next);
    updateMenuFromText(next);
  };

  const pickRecipe = (recipe: Recipe) => {
    // Replace the trailing /partial with /trigger + a space so the user can keep typing.
    const replaced = text.replace(SLASH_RE, (_match, _q, _offset) => {
      const lead = _match.startsWith('/') ? '' : _match[0];
      return `${lead}/${recipe.trigger} `;
    });
    setText(replaced);
    setMenuOpen(false);
    setMenuQuery('');
    setActiveIndex(0);
    // re-focus
    requestAnimationFrame(() => {
      taRef.current?.focus();
      const el = taRef.current;
      if (el) el.selectionStart = el.selectionEnd = replaced.length;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen && visibleRecipes.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % visibleRecipes.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(
          (i) => (i - 1 + visibleRecipes.length) % visibleRecipes.length,
        );
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        pickRecipe(visibleRecipes[activeIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !menuOpen) {
      e.preventDefault();
      submit();
    }
  };

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || disabled || pending) return;
    setText('');
    setMenuOpen(false);
    setMenuQuery('');
    await onSend(trimmed, null);
  };

  return (
    <div className="border-t hairline px-3 pt-2 pb-3 relative">
      {menuOpen && (
        <RecipeMenu
          recipes={visibleRecipes}
          query={menuQuery}
          activeIndex={activeIndex}
          onPick={pickRecipe}
          onHover={setActiveIndex}
        />
      )}
      {/* Composer styled as an editorial dateline-rule input. The hairline
          underline replaces the boxed border; on focus the underline thickens
          to ink to give a clear active state without a busy box. */}
      <div
        className="flex items-end gap-2 px-1 pt-1 pb-1 border-b transition-colors focus-within:border-ink"
        style={{ borderColor: 'oklch(var(--edge))' }}
      >
        <textarea
          ref={taRef}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={
            disabled
              ? 'Set an API key in Settings to start chatting…'
              : 'Ask anything, or type / for a recipe'
          }
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm leading-relaxed focus:outline-none placeholder:text-ink-soft min-h-[24px] max-h-[180px]"
          style={{ height: 'auto' }}
          data-testid="chat-composer"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || pending || !text.trim()}
          aria-label="Send"
          data-testid="chat-send"
          className="shrink-0 p-1.5 transition-colors disabled:opacity-30 text-ink-muted hover:text-ink"
        >
          <Send size={14} strokeWidth={1.8} />
        </button>
      </div>
      <div className="dateline mt-2 px-1">
        Enter to send · Shift+Enter for newline · / for recipes
      </div>
    </div>
  );
});
