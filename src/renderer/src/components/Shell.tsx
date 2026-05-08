import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-screen w-screen grid-cols-[260px_1fr] bg-surface text-ink">
      <Sidebar />
      <main className="relative h-screen overflow-hidden surface">
        <div className="titlebar-drag absolute inset-x-0 top-0 h-9 z-10" />
        {children}
      </main>
    </div>
  );
}
