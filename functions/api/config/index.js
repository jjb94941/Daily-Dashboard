// GET /api/config → returns user's saved config (or defaults).
// PUT /api/config → save config { cities, stocks, indices, newsSources, customWidgets }.

import { errorJson, json } from '../../_utils/helpers.js';
import { defaultConfig } from '../data/index.js';

export async function onRequestGet({ data, env }) {
  if (!data.session) return errorJson(401, 'not signed in');
  const cfg = await env.CACHE.get('config:v1', { type: 'json' });
  return json(cfg || defaultConfig());
}

export async function onRequestPut({ data, env, request }) {
  if (!data.session) return errorJson(401, 'not signed in');
  let body;
  try { body = await request.json(); }
  catch { return errorJson(400, 'invalid JSON'); }
  // Light validation — keep what we expect, ignore the rest.
  const sanitized = {
    cities:        Array.isArray(body.cities)        ? body.cities.slice(0, 30)        : [],
    stocks:        Array.isArray(body.stocks)        ? body.stocks.slice(0, 30)        : [],
    indices:       Array.isArray(body.indices)       ? body.indices.slice(0, 10)       : [],
    newsSources:   Array.isArray(body.newsSources)   ? body.newsSources.slice(0, 20)   : [],
    customWidgets: Array.isArray(body.customWidgets) ? body.customWidgets.slice(0, 20) : []
  };
  await env.CACHE.put('config:v1', JSON.stringify(sanitized));
  // Invalidate the data cache so the next /api/data refreshes with the new config.
  await env.CACHE.delete('daily-data:v1');
  return json({ ok: true, config: sanitized });
}
