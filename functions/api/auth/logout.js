// POST /api/auth/logout → deletes session, clears cookie.

import { deleteSession, clearCookie, COOKIE_NAME } from '../../_utils/session.js';

export async function onRequestPost({ data, env }) {
  if (data.session) await deleteSession(env, data.session.id);
  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': clearCookie(COOKIE_NAME) }
  });
}
