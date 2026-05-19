// GET /api/auth/callback -> exchange code, allowlist check, create session, redirect.

import { exchangeCode, getUserInfo } from '../../_utils/google.js';
import { createSession, parseCookies, clearCookie } from '../../_utils/session.js';
import { isAllowed } from '../../_utils/helpers.js';

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookies = parseCookies(request);
    const cookieState = cookies['oauth_state'];

  if (!code) return html(400, 'Missing authorization code.');
    if (!state || !cookieState || state !== cookieState) return html(400, 'OAuth state mismatch. Try signing in again.');

  let tokens;
    try {
          tokens = await exchangeCode(env, code);
    } catch (e) {
          return html(500, 'Token exchange failed: ' + e.message);
    }
    if (!tokens.refresh_token) {
          return html(500, "Google didn't return a refresh token. Visit https://myaccount.google.com/permissions and remove this app, then try again.");
    }

  let profile;
    try {
          profile = await getUserInfo(tokens.access_token);
    } catch (e) {
          return html(500, 'Could not fetch user info: ' + e.message);
    }

  if (!isAllowed(profile.email, env)) {
        return html(403, `Sorry -- ${profile.email} is not on the allowlist for this dashboard.`);
  }

  const now = Date.now();
    const { cookie } = await createSession(env, {
          email: profile.email,
          refreshToken: tokens.refresh_token,
          accessToken: tokens.access_token,
          accessTokenExpiry: now + ((tokens.expires_in || 3600) * 1000)
    });

  const headers = new Headers();
    headers.set('Location', '/');
    headers.append('Set-Cookie', cookie);
    headers.append('Set-Cookie', clearCookie('oauth_state'));
    return new Response(null, { status: 302, headers });
}

function html(status, message) {
    return new Response(
          `<!doctype html><meta charset="utf-8"><title>Sign in</title>
          <style>body{font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;padding:0 16px;color:#18181b;line-height:1.5}
          h1{font-size:18px}p{color:#3f3f46}a{color:#2563eb}</style>
          <h1>Sign-in problem</h1><p>${escape(message)}</p>
          <p><a href="/login">Back to sign in</a></p>`,
      { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
}
function escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
