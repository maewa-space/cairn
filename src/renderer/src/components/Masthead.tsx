// Editorial masthead — small-caps eyebrow on the left, ISO-ish date on
// the right, hairline rule beneath. Used at the top of any "issue" surface
// (home, settings, onboarding). Visual vocabulary mirrors The Browser /
// Stripe Press: tracked uppercase Inter, paper-warm hairline, no chrome.

import type { ReactNode } from 'react';

interface MastheadProps {
  /** Left side eyebrow, e.g. "Quill — Vol. I · Issue 23". */
  left: string;
  /** Right side dateline, e.g. "Wed, May 8, 2026". Optional. */
  right?: string;
  /** Optional supplementary slot (e.g. a back link); rendered before the rule. */
  trailing?: ReactNode;
}

export function Masthead({ left, right, trailing }: MastheadProps) {
  return (
    <header className="mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="eyebrow">{left}</span>
        {right && <span className="dateline">{right}</span>}
      </div>
      {trailing}
      <div className="rule mt-2.5" />
    </header>
  );
}
