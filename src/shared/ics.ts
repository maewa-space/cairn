// Minimal RFC 5545 (.ics) VEVENT parser.
//
// Quill's calendar feature is intentionally local-first: the user pastes an
// ICS feed URL (Google Calendar, Outlook, iCloud, Fastmail — all expose one)
// or imports a .ics file. We don't OAuth into anything.
//
// Supported:
//   - VEVENT blocks with SUMMARY, DTSTART, DTEND, ATTENDEE, ORGANIZER,
//     LOCATION, DESCRIPTION, UID
//   - Line unfolding (RFC 5545 §3.1)
//   - Both DATE-TIME (20260508T140200Z, 20260508T140200) and DATE (20260508)
//     forms; date-only is treated as a day-long all-day event
//
// Not supported:
//   - RRULE expansion (recurring events ship as individual VEVENTs from most
//     feeds; if you really need RRULE expansion, paste a feed that already
//     unrolls them)
//   - VTIMEZONE (we honor the trailing Z and any explicit offset; everything
//     else is treated as local time)

export interface ParsedEvent {
  uid: string;
  title: string;
  startsAt: string; // ISO
  endsAt: string;   // ISO
  attendees: string[];
  location: string | null;
  description: string | null;
}

export function parseIcs(raw: string): ParsedEvent[] {
  const lines = unfold(raw.replace(/\r\n/g, '\n').split('\n'));
  const events: ParsedEvent[] = [];
  let current: Partial<ParsedEvent> & { attendees?: string[] } | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = { attendees: [] };
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) {
        const finalized = finalize(current);
        if (finalized) events.push(finalized);
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = unescape(line.slice(colon + 1));
    const [name] = head.split(';');
    switch (name) {
      case 'UID':
        current.uid = value;
        break;
      case 'SUMMARY':
        current.title = value;
        break;
      case 'DTSTART':
        current.startsAt = parseDateLike(head, value);
        break;
      case 'DTEND':
        current.endsAt = parseDateLike(head, value);
        break;
      case 'LOCATION':
        current.location = value || null;
        break;
      case 'DESCRIPTION':
        current.description = value || null;
        break;
      case 'ATTENDEE':
      case 'ORGANIZER': {
        const display = pickDisplayName(head, value);
        if (display) {
          if (!current.attendees) current.attendees = [];
          if (!current.attendees.includes(display)) {
            current.attendees.push(display);
          }
        }
        break;
      }
      default:
        break;
    }
  }
  return events;
}

function finalize(
  partial: Partial<ParsedEvent> & { attendees?: string[] },
): ParsedEvent | null {
  if (!partial.uid || !partial.startsAt || !partial.endsAt || !partial.title) {
    return null;
  }
  return {
    uid: partial.uid,
    title: partial.title,
    startsAt: partial.startsAt,
    endsAt: partial.endsAt,
    attendees: partial.attendees ?? [],
    location: partial.location ?? null,
    description: partial.description ?? null,
  };
}

function unfold(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (out.length > 0) {
        out[out.length - 1] += line.slice(1);
      }
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescape(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseDateLike(head: string, value: string): string {
  // DATE-only: 20260508
  if (/^\d{8}$/.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    return new Date(`${y}-${m}-${d}T00:00:00Z`).toISOString();
  }
  // DATE-TIME UTC: 20260508T140200Z
  const utcMatch = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (utcMatch) {
    const [, y, m, d, hh, mm, ss] = utcMatch;
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`).toISOString();
  }
  // DATE-TIME local (no zone, no Z): 20260508T140200
  const localMatch = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (localMatch) {
    const [, y, m, d, hh, mm, ss] = localMatch;
    // Honor TZID parameter if present, otherwise treat as local. Without a
    // proper VTIMEZONE table we can't resolve TZID names — falling back to
    // local matches the user-facing-clock expectation.
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}`).toISOString();
  }
  // Bail out — return as-is so the caller can decide. Not strictly conformant,
  // but lets odd feeds at least get inserted.
  return value;
}

function pickDisplayName(head: string, value: string): string | null {
  const cnMatch = head.match(/CN=([^;:]+)/i);
  const cn = cnMatch ? cnMatch[1].replace(/^"|"$/g, '').trim() : '';
  if (cn) return cn;
  if (value.startsWith('mailto:')) return value.slice(7);
  return value || null;
}
