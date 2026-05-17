// GET /api/auth/login → redirect to Google OAuth consent.
// Sets a short-lived state cookie for CSRF protection.

import { buildAuthUrl } from '../../_utils/google.js';
import { makeCookie } from '../../_utils/session.js';

export async function onRequestGet({ env }) {
  const stateBuf = new Uint8Array(16);
  crypto.getRandomValues(stateBuf);
  const state = Array.from(stateBuf, b => b.toString(16).padStart(2, '0')).join('');
  const url = buildAuthUrl(env, state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Set-Cookie': makeCookie('oauth_state', state, { maxAge: 600 })
    }
  });
}
