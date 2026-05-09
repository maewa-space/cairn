// Default-title generator for new meetings.
//
// When a meeting starts without a calendar match, we used to fall back to
// the literal string "Untitled meeting" — which left every row in the
// sidebar reading the same. Instead, generate a readable timestamp:
//
//     "Mon May 12 · 14:30"
//
// Sortable mentally, distinguishable in a list, and sets up the Enhance
// auto-title pass to refine it once the transcript carries content.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Format a Date as "Mon May 12 · 14:30" using its local components. */
export function defaultMeetingTitle(now: Date = new Date()): string {
  if (Number.isNaN(now.getTime())) return 'New meeting';
  const weekday = WEEKDAYS[now.getDay()];
  const month = MONTHS[now.getMonth()];
  const day = now.getDate();
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  return `${weekday} ${month} ${day} · ${hours}:${mins}`;
}

/** Heuristic: does this look like a Quill-generated default title? Used in
 *  one-off migrations and at sites that need to detect auto titles without
 *  consulting the new title_is_auto flag (e.g. legacy data paths). */
export function looksLikeAutoTitle(title: string): boolean {
  if (!title) return true;
  if (title === 'Untitled meeting') return true;
  // "Mon May 12 · 14:30" pattern.
  if (/^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} · \d{2}:\d{2}$/.test(title)) {
    return true;
  }
  return false;
}
