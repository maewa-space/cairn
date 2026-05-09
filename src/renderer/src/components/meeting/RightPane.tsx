import { useEffect, useState } from 'react';
import type { TranscriptEntry } from '@shared/types.js';
import { ChatPanel } from '../chat/ChatPanel';
import { TranscriptStream } from './TranscriptStream';

type Tab = 'chat' | 'transcript';

interface RightPaneProps {
  meetingId: string;
  entries: TranscriptEntry[];
}

const TAB_PREF_KEY = 'quill.meeting.rightPane';

export function RightPane({ meetingId, entries }: RightPaneProps) {
  const [tab, setTab] = useState<Tab>(() => {
    const v =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(TAB_PREF_KEY)
        : null;
    return v === 'transcript' ? 'transcript' : 'chat';
  });
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      window.quill.keys.has('anthropic'),
      window.quill.keys.has('openai'),
      window.quill.keys.has('openrouter'),
    ]).then(([a, o, r]) => {
      if (alive) setHasKey(a || o || r);
    });
    return () => {
      alive = false;
    };
  }, []);

  const switchTab = (next: Tab) => {
    setTab(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TAB_PREF_KEY, next);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b hairline px-3 pt-3 pb-2">
        <TabButton active={tab === 'chat'} onClick={() => switchTab('chat')}>
          Chat
        </TabButton>
        <TabButton
          active={tab === 'transcript'}
          onClick={() => switchTab('transcript')}
        >
          Transcript
          {entries.length > 0 && (
            <span className="ml-1 text-[10px] text-ink-soft">{entries.length}</span>
          )}
        </TabButton>
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'chat' ? (
          <ChatPanel
            meetingId={meetingId}
            folderId={null}
            scope="meeting"
            hasAnyKey={hasKey ?? true}
            emptyHint="Ask about this meeting. Try /coach, /follow-up, /action-items, /decisions, or /objections."
          />
        ) : (
          <TranscriptStream entries={entries} />
        )}
      </div>
    </div>
  );
}

function TabButton({
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
      className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
        active
          ? 'bg-surface-3 text-ink'
          : 'text-ink-muted hover:bg-surface-3 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
