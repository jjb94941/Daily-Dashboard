export function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(init.headers || {}) }
  });
}

export function errorJson(status, message, extra = {}) {
  return json({ error: message, ...extra }, { status });
}

export function isAllowed(email, env) {
  const allow = (env.ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return allow.includes(String(email || '').toLowerCase());
}
