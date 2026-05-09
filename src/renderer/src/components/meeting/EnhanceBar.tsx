import { useEffect, useRef, useState } from 'react';
import { Sparkles, ChevronDown, Loader2 } from 'lucide-react';
import type { Template } from '@shared/types.js';
import { MenuPanel } from '../ui/MenuPanel';

interface EnhanceBarProps {
  disabled: boolean;
  enhancing: boolean;
  selectedTemplateId: string | null;
  onSelect: (id: string) => void;
  onRun: () => void;
}

export function EnhanceBar(props: EnhanceBarProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.quill.templates.list().then((list) => {
      setTemplates(list);
      if (!props.selectedTemplateId && list[0]) {
        props.onSelect(list[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Outside click + Esc close.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected =
    templates.find((t) => t.id === props.selectedTemplateId) ?? templates[0];

  return (
    <div className="flex items-center gap-2">
      <div className="relative" ref={wrapperRef}>
        <button
          className="btn btn-secondary"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          data-testid="template-picker"
        >
          {selected?.name ?? 'Choose template'}
          <ChevronDown size={12} />
        </button>
        {open && (
          <MenuPanel
            role="listbox"
            ariaLabel="Templates"
            className="absolute right-0 mt-1 w-72 rounded-md border z-20 shadow-xl py-1"
            style={{
              background: 'oklch(var(--surface))',
              borderColor: 'oklch(var(--edge))',
            }}
          >
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={props.selectedTemplateId === t.id}
                onClick={() => {
                  props.onSelect(t.id);
                  setOpen(false);
                }}
                className={`block w-full text-left px-3 py-2 text-sm hover:bg-surface-2 ${
                  props.selectedTemplateId === t.id ? 'bg-surface-2' : ''
                }`}
                data-testid={`template-option-${t.id}`}
              >
                <div className="font-medium">{t.name}</div>
                <div className="text-[11px] text-ink-soft line-clamp-1">
                  {t.description}
                </div>
              </button>
            ))}
          </MenuPanel>
        )}
      </div>
      <button
        onClick={props.onRun}
        disabled={props.disabled || props.enhancing}
        className="btn btn-primary disabled:opacity-50"
        data-testid="enhance-run"
        aria-live="polite"
      >
        {props.enhancing ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Sparkles size={13} />
        )}
        {props.enhancing ? (
          <span className="font-serif italic">polishing…</span>
        ) : (
          'Enhance notes'
        )}
      </button>
    </div>
  );
}
