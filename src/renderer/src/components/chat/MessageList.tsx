import { useEffect, useRef } from 'react';
import { animate } from 'motion';
import type { ChatMessage } from '@shared/types.js';
import { renderMarkdown } from '../../lib/markdown';

interface MessageListProps {
  messages: ChatMessage[];
  pending: boolean;
  emptyHint?: string;
}

export function MessageList({ messages, pending, emptyHint }: MessageListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
    // Soft fade on the LAST message that just arrived. Skip the very first
    // mount so a long preloaded history doesn't all fade in.
    if (messages.length > lastCountRef.current && lastCountRef.current > 0) {
      const rows = ref.current.querySelectorAll('[data-role]');
      const newest = rows[rows.length - 1];
      if (newest) {
        animate(
          newest as Element,
          { opacity: [0, 1], y: [4, 0] },
          { duration: 0.22, ease: 'easeOut' },
        );
      }
    }
    lastCountRef.current = messages.length;
  }, [messages.length, pending]);

  return (
    <div
      ref={ref}
      className="scroll-thin h-full overflow-y-auto px-5 py-4 space-y-4"
      data-testid="chat-messages"
    >
      {messages.length === 0 && !pending && (
        <p className="microcopy text-sm leading-relaxed max-w-prose">
          {emptyHint ??
            'Ask about this meeting. Start with /coach, /follow-up, or any recipe to apply a prompt template.'}
        </p>
      )}
      {messages.map((m) => (
        <ChatBubble key={m.id} message={m} />
      ))}
      {pending && (
        <div
          className="flex items-center gap-2 text-xs text-ink-soft"
          role="status"
          aria-live="polite"
        >
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full bg-ink-soft"
            style={{ animation: 'breathe 2.4s var(--ease-in-out-soft) infinite' }}
          />
          <span className="font-serif italic">thinking…</span>
        </div>
      )}
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  if (isUser) {
    // User question — right-aligned italic serif, no background.
    // Reads as the questioner's voice in the column.
    return (
      <div data-role={message.role} className="flex flex-col items-end">
        {message.recipeId && (
          <div className="dateline mb-1 text-moss">
            /{message.recipeId}
          </div>
        )}
        <p
          className="font-serif italic text-[15px] leading-relaxed max-w-[80ch] text-right whitespace-pre-wrap text-ink"
        >
          {message.content}
        </p>
      </div>
    );
  }
  // Assistant reply — left-aligned sans, with a moss vertical rule on
  // the left. No background bubble; reads as a quoted column response.
  return (
    <div data-role={message.role} className="flex">
      <div
        className="prose-chat pl-4 max-w-[80ch] text-[14px] leading-relaxed border-l-2"
        style={{ borderColor: 'oklch(var(--moss))', color: 'oklch(var(--ink))' }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
      />
    </div>
  );
}
