import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { animate } from 'motion';
import { Sidebar } from './Sidebar';
import { BREAKPOINTS, useMediaQuery } from '../hooks/useMediaQuery';

export function Shell({ children }: { children: ReactNode }) {
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const firstRouteRef = useRef(true);
  const compact = useMediaQuery(BREAKPOINTS.compactSidebar);
  const mobile = useMediaQuery(BREAKPOINTS.mobile);

  // User can override the auto-collapse decision. The override resets when
  // the auto state flips back, so resizing the window doesn't trap them in
  // an unwanted mode forever.
  const [overlayOpen, setOverlayOpen] = useState(false);
  useEffect(() => {
    if (!compact) setOverlayOpen(false);
  }, [compact]);

  // Soft fade + lift on route change so the app feels considered rather
  // than snappy. Skip the very first paint so the masthead doesn't fade
  // in twice on initial load. The reduced-motion guard in global.css
  // collapses the duration to ~0 so users with the OS setting see hard
  // cuts instead.
  useEffect(() => {
    if (firstRouteRef.current) {
      firstRouteRef.current = false;
      return;
    }
    const el = mainRef.current;
    if (!el) return;
    animate(
      el,
      { opacity: [0.4, 1], y: [4, 0] },
      { duration: 0.18, ease: 'easeOut' },
    );
  }, [location.pathname]);

  // Window title reflects the current route so macOS Mission Control,
  // window-switcher, and screen-reader users see something useful.
  useEffect(() => {
    document.title = titleFromPath(location.pathname);
  }, [location.pathname]);

  // Close the overlay sidebar on route change so it doesn't stay open after
  // the user picks a meeting from it.
  useEffect(() => {
    setOverlayOpen(false);
  }, [location.pathname]);

  if (mobile) {
    return (
      <div className="flex h-screen w-screen flex-col bg-surface text-ink">
        <main ref={mainRef} className="relative flex-1 min-h-0 overflow-hidden surface">
          <div className="titlebar-drag absolute inset-x-0 top-0 h-9 z-10" />
          {children}
        </main>
        <Sidebar
          variant="mobile"
          overlayOpen={overlayOpen}
          onOverlayClose={() => setOverlayOpen(false)}
          onOverlayOpen={() => setOverlayOpen(true)}
        />
      </div>
    );
  }

  if (compact) {
    return (
      <div className="grid h-screen w-screen grid-cols-[64px_1fr] bg-surface text-ink">
        <Sidebar
          variant="compact"
          overlayOpen={overlayOpen}
          onOverlayClose={() => setOverlayOpen(false)}
          onOverlayOpen={() => setOverlayOpen(true)}
        />
        <main ref={mainRef} className="relative h-screen overflow-hidden surface">
          <div className="titlebar-drag absolute inset-x-0 top-0 h-9 z-10" />
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="grid h-screen w-screen grid-cols-[260px_1fr] bg-surface text-ink">
      <Sidebar variant="full" />
      <main ref={mainRef} className="relative h-screen overflow-hidden surface">
        <div className="titlebar-drag absolute inset-x-0 top-0 h-9 z-10" />
        {children}
      </main>
    </div>
  );
}

function titleFromPath(pathname: string): string {
  if (pathname.startsWith('/meeting/')) return 'Quill — Meeting';
  if (pathname.startsWith('/templates')) return 'Quill — Templates';
  if (pathname.startsWith('/settings')) return 'Quill — Settings';
  if (pathname.startsWith('/chat')) return 'Quill — Chat';
  if (pathname.startsWith('/welcome') || pathname.startsWith('/onboarding'))
    return 'Quill — Welcome';
  return 'Quill';
}
