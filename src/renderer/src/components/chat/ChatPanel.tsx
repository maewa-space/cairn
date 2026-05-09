import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, Recipe, RecipeScope } from '@shared/types.js';
import { Composer, type ComposerHandle } from './Composer';
import { MessageList } from './MessageList';
import { Trash2 } from 'lucide-react';

interface ChatPanelProps {
  meetingId: string | null;
  folderId: string | null;
  scope: RecipeScope;
  emptyHint?: string;
  hasAnyKey: boolean;
}

export function ChatPanel({
  meetingId,
  folderId,
  scope,
  emptyHint,
  hasAnyKey,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [pending, setPending] = useState(false);
  const composerRef = useRef<ComposerHandle>(null);

  const refreshHistory = useCallback(async () => {
    const list = await window.quill.chat.history({ meetingId, folderId });
    setMessages(list);
  }, [meetingId, folderId]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    let alive = true;
    window.quill.recipes.list().then((list) => {
      if (alive) setRecipes(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const onSend = useCallback(
    async (text: string, recipeId: string | null) => {
      setPending(true);
      // Optimistic: append user message immediately so the UI feels responsive.
      const optimisticUser: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        meetingId,
        folderId,
        role: 'user',
        content: text,
        recipeId,
        createdAt: new Date().toISOString(),
        inputTokens: null,
        outputTokens: null,
        model: null,
      };
      setMessages((prev) => [...prev, optimisticUser]);
      try {
        await window.quill.chat.send({
          meetingId,
          folderId,
          message: text,
          recipeId,
        });
      } catch (err) {
        // Surface the failure instead of swallowing it.
        console.error('[chat:send]', err);
      } finally {
        await refreshHistory();
        setPending(false);
        composerRef.current?.focus();
      }
    },
    [meetingId, folderId, refreshHistory],
  );

  const clearChat = async () => {
    if (!window.confirm('Clear chat history for this scope?')) return;
    await window.quill.chat.clear({ meetingId, folderId });
    await refreshHistory();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b hairline px-5 py-2">
        <span className="text-[11px] uppercase tracking-wider text-ink-soft">
          Chat
        </span>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearChat}
            aria-label="Clear chat"
            className="text-ink-soft hover:text-ink transition-colors"
            data-testid="chat-clear"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <MessageList
          messages={messages}
          pending={pending}
          emptyHint={emptyHint}
        />
      </div>
      <Composer
        ref={composerRef}
        recipes={recipes}
        scope={scope}
        pending={pending}
        disabled={!hasAnyKey}
        onSend={onSend}
      />
    </div>
  );
}
