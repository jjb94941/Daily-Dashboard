// Google OAuth + API helpers.

import { updateSession } from './session.js';

export const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly'
].join(' ');

export function buildAuthUrl(env, state) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${env.APP_URL}/api/auth/callback`,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(env, code) {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: `${env.APP_URL}/api/auth/callback`,
    grant_type: 'authorization_code'
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!r.ok) throw new Error('Token exchange failed: ' + (await r.text()));
  return r.json(); // { access_token, refresh_token, expires_in, id_token, ... }
}

export async function refreshAccessToken(env, refreshToken) {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!r.ok) throw new Error('Token refresh failed: ' + (await r.text()));
  return r.json(); // { access_token, expires_in, ... }
}

export async function getUserInfo(accessToken) {
  const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: 'Bearer ' + accessToken }
  });
  if (!r.ok) throw new Error('userinfo failed');
  return r.json(); // { email, name, picture, sub, ... }
}

// Make sure the session's access token is fresh. Mutates `session` and
// persists if a refresh occurred. Returns the active access token.
export async function ensureAccessToken(env, session) {
  const now = Date.now();
  const buffer = 60 * 1000; // 1 minute buffer
  if (session.accessToken && session.accessTokenExpiry && session.accessTokenExpiry - buffer > now) {
    return session.accessToken;
  }
  if (!session.refreshToken) throw new Error('No refresh token in session');
  const tok = await refreshAccessToken(env, session.refreshToken);
  session.accessToken = tok.access_token;
  session.accessTokenExpiry = now + (tok.expires_in * 1000);
  await updateSession(env, session.id, {
    email: session.email,
    refreshToken: session.refreshToken,
    accessToken: session.accessToken,
    accessTokenExpiry: session.accessTokenExpiry
  });
  return session.accessToken;
}

// --- Gmail ---

export async function gmailSearchThreads(accessToken, query, maxResults = 30) {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/threads');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(maxResults));
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (!r.ok) throw new Error('Gmail list threads failed: ' + (await r.text()));
  return r.json();
}

export async function gmailGetThread(accessToken, threadId, format = 'metadata') {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/threads/' + threadId);
  url.searchParams.set('format', format);
  if (format === 'metadata') {
    ['Subject', 'From', 'Date'].forEach(h => url.searchParams.append('metadataHeaders', h));
  }
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (!r.ok) throw new Error('Gmail get thread failed: ' + (await r.text()));
  return r.json();
}

// --- Calendar ---

export async function calendarListEvents(accessToken, { calendarId = 'primary', timeMin, timeMax, timeZone, maxResults = 25 } = {}) {
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  if (timeMin) url.searchParams.set('timeMin', timeMin);
  if (timeMax) url.searchParams.set('timeMax', timeMax);
  if (timeZone) url.searchParams.set('timeZone', timeZone);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', String(maxResults));
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (!r.ok) throw new Error('Calendar list failed: ' + (await r.text()));
  return r.json();
}
