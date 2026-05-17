// GET /api/email/unread → unread email subjects from the last 24h.

import { ensureAccessToken, gmailSearchThreads, gmailGetThread } from '../../_utils/google.js';
import { errorJson, json } from '../../_utils/helpers.js';

export async function onRequestGet({ data, env }) {
  if (!data.session) return errorJson(401, 'not signed in');
  try {
    const accessToken = await ensureAccessToken(env, data.session);
    const list = await gmailSearchThreads(accessToken, 'is:unread newer_than:1d -in:draft', 30);
    const threads = list.threads || [];
    // Fetch metadata for each in parallel (cap at 30 → safe).
    const detailed = await Promise.all(threads.map(async t => {
      try {
        const full = await gmailGetThread(accessToken, t.id, 'metadata');
        const first = (full.messages && full.messages[0]) || {};
        const headers = (first.payload && first.payload.headers) || [];
        const subj = headerValue(headers, 'Subject') || '(no subject)';
        const fromRaw = headerValue(headers, 'From') || '';
        const date = headerValue(headers, 'Date') || '';
        return {
          id: t.id,
          subject: subj,
          sender: cleanSender(fromRaw),
          date: new Date(date).toISOString()
        };
      } catch {
        return { id: t.id, subject: '(error fetching)', sender: '', date: null };
      }
    }));
    return json({ threads: detailed });
  } catch (e) {
    return errorJson(502, 'email fetch failed', { detail: e.message });
  }
}

function headerValue(headers, name) {
  const h = headers.find(x => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : null;
}
function cleanSender(from) {
  // Strip "<email>" portion if a display name exists; otherwise return the email.
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>/);
  if (m) return (m[1] || m[2]).replace(/^"|"$/g, '').trim();
  return from.trim();
}
