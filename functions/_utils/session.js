// Session helpers — signed cookies + KV-backed session storage.

const COOKIE_NAME = 'dashboard_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const encoder = new TextEncoder();

function bytesToHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function sign(value, secret) {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToHex(new Uint8Array(sig));
}

export async function verify(value, signatureHex, secret) {
  const key = await importHmacKey(secret);
  const sig = hexToBytes(signatureHex);
  return crypto.subtle.verify('HMAC', key, sig, encoder.encode(value));
}

export function newSessionId() {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const out = {};
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join('='));
  }
  return out;
}

export function makeCookie(name, value, { maxAge, path = '/', sameSite = 'Lax', secure = true, httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  if (secure) parts.push('Secure');
  if (httpOnly) parts.push('HttpOnly');
  return parts.join('; ');
}

export function clearCookie(name) {
  return makeCookie(name, '', { maxAge: 0 });
}

// Get the session from the request. Returns the session record or null.
export async function getSession(request, env) {
  const cookies = parseCookies(request);
  const raw = cookies[COOKIE_NAME];
  if (!raw) return null;
  const [sid, sig] = raw.split('.');
  if (!sid || !sig) return null;
  const ok = await verify(sid, sig, env.SESSION_SECRET);
  if (!ok) return null;
  const stored = await env.SESSIONS.get('sess:' + sid, { type: 'json' });
  if (!stored) return null;
  return { id: sid, ...stored };
}

// Create a new session, return Set-Cookie header value and the sid.
export async function createSession(env, data) {
  const sid = newSessionId();
  await env.SESSIONS.put('sess:' + sid, JSON.stringify(data), { expirationTtl: SESSION_TTL_SECONDS });
  const sig = await sign(sid, env.SESSION_SECRET);
  return {
    sid,
    cookie: makeCookie(COOKIE_NAME, `${sid}.${sig}`, { maxAge: SESSION_TTL_SECONDS })
  };
}

export async function updateSession(env, sid, data) {
  await env.SESSIONS.put('sess:' + sid, JSON.stringify(data), { expirationTtl: SESSION_TTL_SECONDS });
}

export async function deleteSession(env, sid) {
  if (sid) await env.SESSIONS.delete('sess:' + sid);
}

export { COOKIE_NAME };
