// Runs on every request. Attaches the session (if any) to context.data
// so downstream functions can read it without re-parsing the cookie.

import { getSession } from './_utils/session.js';

export async function onRequest(context) {
  try {
    context.data.session = await getSession(context.request, context.env);
  } catch {
    context.data.session = null;
  }
  return context.next();
}
