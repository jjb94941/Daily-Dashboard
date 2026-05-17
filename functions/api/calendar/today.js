// GET /api/calendar/today → today's events for the signed-in user.
// Query: tz (optional IANA timezone; defaults to America/Los_Angeles).

import { ensureAccessToken, calendarListEvents } from '../../_utils/google.js';
import { errorJson, json } from '../../_utils/helpers.js';

export async function onRequestGet({ data, env, request }) {
  if (!data.session) return errorJson(401, 'not signed in');
  const tz = new URL(request.url).searchParams.get('tz') || 'America/Los_Angeles';

  const now = new Date();
  // Compute start-of-day and end-of-day in the user's tz, expressed as ISO with offset.
  const start = isoStartOfDay(now, tz);
  const end = isoEndOfDay(now, tz);

  try {
    const accessToken = await ensureAccessToken(env, data.session);
    const res = await calendarListEvents(accessToken, {
      timeMin: start, timeMax: end, timeZone: tz, maxResults: 25
    });
    const events = (res.items || []).map(e => ({
      id: e.id,
      summary: e.summary || '(no title)',
      start: e.start,
      end: e.end,
      location: e.location || null,
      htmlLink: e.htmlLink,
      allDay: !!(e.start && e.start.date && !e.start.dateTime)
    }));
    return json({ events, tz });
  } catch (e) {
    return errorJson(502, 'calendar fetch failed', { detail: e.message });
  }
}

// Build an ISO timestamp at 00:00 / 23:59:59.999 in the given IANA timezone.
function isoStartOfDay(now, tz) { return shiftToTz(now, tz, 0, 0, 0, 0); }
function isoEndOfDay(now, tz)   { return shiftToTz(now, tz, 23, 59, 59, 999); }

function shiftToTz(date, tz, h, m, s, ms) {
  // Use Intl to extract the y/m/d in the target tz, then build a date at the desired time
  // expressed in that tz. We round-trip through ISO with the tz offset.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date).reduce((o, p) => (o[p.type] = p.value, o), {});
  const y = parts.year, mo = parts.month, d = parts.day;
  // Compute offset for this date in this tz
  const dummy = new Date(`${y}-${mo}-${d}T12:00:00Z`);
  const offsetMin = getTzOffsetMinutes(dummy, tz);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const oh = String(Math.floor(abs / 60)).padStart(2, '0');
  const om = String(abs % 60).padStart(2, '0');
  return `${y}-${mo}-${d}T${pad(h)}:${pad(m)}:${pad(s)}.${String(ms).padStart(3, '0')}${sign}${oh}:${om}`;
}
function pad(n) { return String(n).padStart(2, '0'); }
function getTzOffsetMinutes(date, tz) {
  // Difference between the tz wall clock and UTC at this instant, in minutes.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const p = dtf.formatToParts(date).reduce((o, x) => (o[x.type] = x.value, o), {});
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour === 24 ? 0 : +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}
