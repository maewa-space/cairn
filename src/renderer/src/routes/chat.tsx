import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import type { Folder } from '@shared/types.js';
import { ChatPanel } from '../components/chat/ChatPanel';
import { Folder as FolderIcon, Globe } from 'lucide-react';

export function ChatRoute() {
  const [params] = useSearchParams();
  const folderId = params.get('folder');
  const [folders, setFolders] = useState<Folder[]>([]);

  useEffect(() => {
    let alive = true;
    window.quill.folders.list().then((list) => {
      if (alive) setFolders(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const folder = useMemo(
    () => folders.find((f) => f.id === folderId) ?? null,
    [folders, folderId],
  );

  // ChatPanel is keyed so it remounts cleanly when scope changes.
  return (
    <div className="grid h-full grid-rows-[auto_1fr] pt-9">
      <header className="flex items-center justify-between border-b hairline px-7 py-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-soft mb-1">
            {folder ? 'Folder chat' : 'Global chat'}
          </div>
          <h1
            className="font-serif text-3xl tracking-tight"
            style={{ letterSpacing: '-0.022em' }}
          >
            {folder ? folder.name : 'Across all meetings'}
          </h1>
          <p className="mt-1 text-sm text-ink-muted max-w-prose">
            {folder
              ? `Grounds against meetings inside "${folder.name}".`
              : 'Grounds against your last 25 meetings. Use /prep to prep for an upcoming conversation.'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            to="/chat"
            className={`btn btn-ghost text-xs ${!folder ? 'text-ink' : 'text-ink-muted'}`}
          >
            <Globe size={12} /> Global
          </Link>
          {folders.map((f) => (
            <Link
              key={f.id}
              to={`/chat?folder=${f.id}`}
              className={`btn btn-ghost text-xs ${
                folder?.id === f.id ? 'text-ink' : 'text-ink-muted'
              }`}
            >
              <FolderIcon size={12} /> {f.name}
            </Link>
          ))}
        </div>
      </header>
      <div className="grid grid-cols-[1fr_min(720px,_92%)] min-h-0">
        <div />
        <ChatPanel
          key={folder?.id ?? 'global'}
          meetingId={null}
          folderId={folder?.id ?? null}
          scope="global"
          hasAnyKey
          emptyHint={
            folder
              ? `Ask anything about "${folder.name}". Recipes from /coach, /follow-up etc. work here too.`
              : 'Ask anything across your meetings. Try /prep to prep for the next conversation.'
          }
        />
      </div>
    </div>
  );
}
