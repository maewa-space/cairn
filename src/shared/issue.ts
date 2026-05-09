// Editorial chrome — derives "issue" metadata for the masthead.
// Issue number is just the running count of meetings, so the masthead
// reads "Vol. I · Issue 23" after twenty-three recordings. Volume rolls
// to II at 100 issues — keeps the line short forever.
//
// Lives in `shared/` so both renderer (sidebar foot, masthead) and main
// process (PDF masthead) read from the same source.

const ISSUES_PER_VOLUME = 100;

export interface IssueInfo {
  /** "Vol. I", "Vol. II", … in roman numerals. */
  volume: string;
  /** "Issue 23" — 1-indexed. Always at least 1. */
  issueLabel: string;
  /** Combined "Vol. I · Issue 23". */
  combined: string;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function deriveIssue(meetingCount: number): IssueInfo {
  // Issue numbering is 1-indexed even at zero meetings — the page in front
  // of the user is always "Issue N", never "Issue 0".
  const safe = Math.max(1, meetingCount);
  const volIdx = Math.floor((safe - 1) / ISSUES_PER_VOLUME);
  const issueNum = ((safe - 1) % ISSUES_PER_VOLUME) + 1;
  const volume = `Vol. ${ROMAN[volIdx] ?? volIdx + 1}`;
  const issueLabel = `Issue ${issueNum}`;
  return {
    volume,
    issueLabel,
    combined: `${volume} · ${issueLabel}`,
  };
}

/** "Wed, May 8, 2026" — newspaper date stamp. */
export function formatIssueDate(d: Date = new Date()): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
