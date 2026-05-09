// Calendar integration — fetch an ICS feed URL or read a local .ics file,
// parse the events, and persist them via calendarRepo. A periodic refresh
// runs every 30 minutes while the app is open. Local-first: no OAuth, no
// account linkage. Any platform that can publish an ICS URL (Google,
// Outlook 365, iCloud, Fastmail, Calendly) works out of the box.

import { readFile } from 'node:fs/promises';
import { calendarRepo, settingsRepo } from './db.js';
import { parseIcs } from '@shared/ics.js';

const REFRESH_MS = 30 * 60 * 1000;
export const SETTINGS_KEY_ICS_URL = 'calendar.icsUrl';
export const SETTINGS_KEY_LAST_REFRESH = 'calendar.lastRefreshAt';
export const SETTINGS_KEY_LAST_ERROR = 'calendar.lastError';
export const CALENDAR_SOURCE_PRIMARY = 'primary';

let timer: NodeJS.Timeout | null = null;

export interface CalendarRefreshResult {
  events: number;
  source: string;
  refreshedAt: string;
}

/** Read the user's saved ICS URL (or local file path). */
export function getIcsUrl(): string | null {
  return settingsRepo.get(SETTINGS_KEY_ICS_URL);
}

/** Save the user's ICS URL (or local file path). Empty string clears it. */
export function setIcsUrl(value: string): void {
  const trimmed = value.trim();
  if (!trimmed) {
    settingsRepo.set(SETTINGS_KEY_ICS_URL, '');
    return;
  }
  settingsRepo.set(SETTINGS_KEY_ICS_URL, trimmed);
}

/** Run a single refresh against the saved URL. Returns the count of events
 *  imported. Throws if the URL isn't set or the fetch/parse fails. */
export async function refresh(): Promise<CalendarRefreshResult> {
  const url = getIcsUrl();
  if (!url) {
    throw new Error('No calendar URL configured.');
  }
  let body: string;
  try {
    body = await fetchIcsBody(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    settingsRepo.set(SETTINGS_KEY_LAST_ERROR, msg);
    throw new Error(`Calendar fetch failed: ${msg}`);
  }

  let parsed;
  try {
    parsed = parseIcs(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    settingsRepo.set(SETTINGS_KEY_LAST_ERROR, msg);
    throw new Error(`Calendar parse failed: ${msg}`);
  }

  const now = new Date();
  // Drop events that ended more than 7 days ago — keeps the table small and
  // matches the auto-titling/upcoming-list use case (we only need recent +
  // future events).
  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const fresh = parsed.filter((e) => {
    const ends = new Date(e.endsAt).getTime();
    return Number.isFinite(ends) && ends >= cutoff;
  });

  calendarRepo.replaceForSource(
    CALENDAR_SOURCE_PRIMARY,
    fresh.map((e) => ({
      uid: e.uid,
      title: e.title,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      attendees: e.attendees,
      location: e.location,
      description: e.description,
      source: CALENDAR_SOURCE_PRIMARY,
    })),
  );

  const refreshedAt = now.toISOString();
  settingsRepo.set(SETTINGS_KEY_LAST_REFRESH, refreshedAt);
  settingsRepo.set(SETTINGS_KEY_LAST_ERROR, '');
  return {
    events: fresh.length,
    source: CALENDAR_SOURCE_PRIMARY,
    refreshedAt,
  };
}

/** Boot a periodic background refresh. Called once from main/index.ts after
 *  the BrowserWindow is ready. Idempotent — calling it twice replaces the
 *  prior interval. */
export function startBackgroundRefresh(): void {
  if (timer) clearInterval(timer);
  // Kick a refresh now if a URL is set, then on the cadence.
  if (getIcsUrl()) {
    refresh().catch((err) => {
      console.warn('[calendar] initial refresh failed:', err);
    });
  }
  timer = setInterval(() => {
    if (!getIcsUrl()) return;
    refresh().catch((err) => {
      console.warn('[calendar] scheduled refresh failed:', err);
    });
  }, REFRESH_MS);
}

export function stopBackgroundRefresh(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export interface CalendarStatus {
  url: string | null;
  lastRefreshAt: string | null;
  lastError: string | null;
  eventCount: number;
}

export function getStatus(): CalendarStatus {
  return {
    url: getIcsUrl(),
    lastRefreshAt: settingsRepo.get(SETTINGS_KEY_LAST_REFRESH),
    lastError: settingsRepo.get(SETTINGS_KEY_LAST_ERROR) || null,
    eventCount: calendarRepo.countForSource(CALENDAR_SOURCE_PRIMARY),
  };
}

async function fetchIcsBody(url: string): Promise<string> {
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('webcal://')
  ) {
    // webcal:// is just http(s):// in disguise.
    const httpUrl = url.replace(/^webcal:\/\//i, 'https://');
    const res = await fetch(httpUrl, {
      headers: { Accept: 'text/calendar, text/plain, */*' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.text();
  }
  if (url.startsWith('file://')) {
    const path = decodeURI(url.slice('file://'.length));
    return await readFile(path, 'utf-8');
  }
  // Treat as a local filesystem path.
  return await readFile(url, 'utf-8');
}
