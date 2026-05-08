import { useEffect, useState } from 'react';
import { Sparkles, ChevronDown, Loader2 } from 'lucide-react';
import type { Template } from '@shared/types.js';

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

  useEffect(() => {
    window.cairn.templates.list().then((list) => {
      setTemplates(list);
      if (!props.selectedTemplateId && list[0]) {
        props.onSelect(list[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected =
    templates.find((t) => t.id === props.selectedTemplateId) ?? templates[0];

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          className="btn btn-secondary"
          onClick={() => setOpen((v) => !v)}
          data-testid="template-picker"
        >
          {selected?.name ?? 'Choose template'}
          <ChevronDown size={12} />
        </button>
        {open && (
          <div
            className="absolute right-0 mt-1 w-72 rounded-md border z-20 shadow-xl py-1"
            style={{
              background: 'oklch(var(--surface))',
              borderColor: 'oklch(var(--edge))',
            }}
          >
            {templates.map((t) => (
              <button
                key={t.id}
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
          </div>
        )}
      </div>
      <button
        onClick={props.onRun}
        disabled={props.disabled || props.enhancing}
        className="btn btn-primary disabled:opacity-50"
        data-testid="enhance-run"
      >
        {props.enhancing ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Sparkles size={13} />
        )}
        {props.enhancing ? 'Enhancing…' : 'Enhance notes'}
      </button>
    </div>
  );
}
