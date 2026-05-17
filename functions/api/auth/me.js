// GET /api/auth/me → returns { email } if signed in, 401 otherwise.

import { errorJson, json } from '../../_utils/helpers.js';

export async function onRequestGet({ data }) {
  if (!data.session) return errorJson(401, 'not signed in');
  return json({ email: data.session.email });
}
