import { useEffect, useState } from 'react';

/** Subscribes to a CSS media query and returns whether it currently matches.
 *  Updates on window resize. Returns false on the server / first render where
 *  matchMedia isn't available, then snaps to the real value once mounted. */
export function useMediaQuery(query: string): boolean {
  const get = () => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  };
  const [matches, setMatches] = useState<boolean>(get);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    // Safari < 14 fallback.
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, [query]);

  return matches;
}

/** Quill's standard responsive thresholds. Keep co-located so callers don't
 *  invent their own breakpoints. */
export const BREAKPOINTS = {
  /** Below this we collapse the sidebar to icons. */
  compactSidebar: '(max-width: 900px)',
  /** Below this the meeting right-pane folds behind a tab. */
  narrowBody: '(max-width: 820px)',
  /** Below this we treat the window like a phone-sized panel. */
  mobile: '(max-width: 560px)',
} as const;
