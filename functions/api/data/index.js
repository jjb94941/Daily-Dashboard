// GET /api/data → returns cached weather + markets + news.
// Auto-refreshes inline if cache is stale (>6h) or ?force=1.

import { errorJson, json } from '../../_utils/helpers.js';

const CACHE_KEY = 'daily-data:v1';
const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6h

const NEWS_FEEDS = {
  nyt: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
  wsj: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml',
  atl: 'https://www.theatlantic.com/feed/all/'
};

export async function onRequestGet({ data, env, request }) {
  if (!data.session) return errorJson(401, 'not signed in');
  const force = new URL(request.url).searchParams.get('force') === '1';

  let cached = await env.CACHE.get(CACHE_KEY, { type: 'json' });
  const stale = !cached || !cached.lastRefresh || (Date.now() - new Date(cached.lastRefresh).getTime() > STALE_AFTER_MS);

  if (force || stale) {
    try {
      const cfg = await env.CACHE.get('config:v1', { type: 'json' });
      const config = cfg || defaultConfig();
      const fresh = await buildFresh(config);
      await env.CACHE.put(CACHE_KEY, JSON.stringify(fresh));
      cached = fresh;
    } catch (e) {
      // If refresh fails, fall through with stale data (if any) and flag it.
      if (!cached) return errorJson(502, 'no data and refresh failed', { detail: e.message });
      cached = { ...cached, refreshError: e.message };
    }
  }
  return json(cached);
}

async function buildFresh(config) {
  const [weather, stocks, indices, news] = await Promise.all([
    fetchWeatherAll(config.cities),
    fetchQuotesAll(config.stocks),
    fetchQuotesAll(config.indices),
    fetchNewsAll(config.newsSources)
  ]);
  return {
    lastRefresh: new Date().toISOString(),
    weather, stocks, indices, news
  };
}

// ---------- Weather: Open-Meteo (free, no key) ----------

async function fetchWeatherAll(cities) {
  const out = {};
  await Promise.all((cities || []).map(async c => {
    try {
      const { latitude, longitude } = await geocode(c);
      const u = new URL('https://api.open-meteo.com/v1/forecast');
      u.searchParams.set('latitude', latitude);
      u.searchParams.set('longitude', longitude);
      u.searchParams.set('current', 'temperature_2m,weather_code');
      u.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,weather_code');
      u.searchParams.set('temperature_unit', 'fahrenheit');
      u.searchParams.set('timezone', c.tz || 'auto');
      u.searchParams.set('forecast_days', '1');
      const r = await fetch(u);
      if (!r.ok) throw new Error('open-meteo ' + r.status);
      const d = await r.json();
      const current = d.current || {};
      const daily = d.daily || {};
      out[c.id] = {
        tempF: Math.round(current.temperature_2m),
        hiF: Math.round((daily.temperature_2m_max || [])[0]),
        loF: Math.round((daily.temperature_2m_min || [])[0]),
        cond: weatherCodeText(current.weather_code),
        icon: weatherCodeEmoji(current.weather_code)
      };
    } catch (e) {
      out[c.id] = { error: e.message };
    }
  }));
  return out;
}

async function geocode(city) {
  if (city.latitude != null && city.longitude != null) return city;
  const u = new URL('https://geocoding-api.open-meteo.com/v1/search');
  u.searchParams.set('name', city.name);
  u.searchParams.set('count', '1');
  const r = await fetch(u);
  if (!r.ok) throw new Error('geocode failed');
  const d = await r.json();
  const hit = (d.results || [])[0];
  if (!hit) throw new Error('city not found');
  return { latitude: hit.latitude, longitude: hit.longitude };
}

function weatherCodeText(code) {
  const m = {
    0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
    80: 'Rain showers', 81: 'Heavy showers', 82: 'Violent showers',
    95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ heavy hail'
  };
  return m[code] || '—';
}
function weatherCodeEmoji(code) {
  if (code == null) return '';
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 65) return '🌧️';
  if (code <= 75) return '🌨️';
  if (code <= 82) return '🌧️';
  if (code <= 99) return '⛈️';
  return '';
}

// ---------- Quotes: Yahoo Finance v8 ----------

async function fetchQuotesAll(symbols) {
  const out = {};
  await Promise.all((symbols || []).map(async s => {
    try {
      const yahooSym = mapSymbol(s.symbol || s.id);
      const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=1d&range=5d`;
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) throw new Error('yahoo ' + r.status);
      const d = await r.json();
      const result = d.chart && d.chart.result && d.chart.result[0];
      if (!result) throw new Error('no chart result');
      const meta = result.meta || {};
      const price = meta.regularMarketPrice;
      const prev = meta.chartPreviousClose;
      const chg = price - prev;
      const pct = prev ? (chg / prev) * 100 : 0;
      out[s.id] = {
        price: round(price, 2),
        chg: round(chg, 2),
        pct: round(pct, 2),
        asOf: new Date((meta.regularMarketTime || Math.floor(Date.now() / 1000)) * 1000).toISOString().slice(0, 10)
      };
    } catch (e) {
      out[s.id] = { error: e.message };
    }
  }));
  return out;
}

function mapSymbol(sym) {
  const s = String(sym).toUpperCase();
  if (s === 'BTC') return 'BTC-USD';
  if (s === 'ETH') return 'ETH-USD';
  if (s === 'S&P 500' || s === 'SPX') return '^GSPC';
  if (s === 'NASDAQ' || s === 'IXIC') return '^IXIC';
  if (s === 'DOW' || s === 'DJI') return '^DJI';
  return s;
}
function round(n, d) { const p = Math.pow(10, d); return Math.round(n * p) / p; }

// ---------- News: RSS feeds ----------

async function fetchNewsAll(sources) {
  const out = {};
  await Promise.all((sources || []).map(async src => {
    const url = NEWS_FEEDS[src.id] || src.feedUrl;
    if (!url) { out[src.id] = []; return; }
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('rss ' + r.status);
      const xml = await r.text();
      out[src.id] = parseRssItems(xml).slice(0, 5);
    } catch (e) {
      out[src.id] = [{ title: '(unavailable: ' + e.message + ')', placeholder: true }];
    }
  }));
  return out;
}

function parseRssItems(xml) {
  // Simple regex-based RSS/Atom parser — sufficient for the major US news feeds.
  const items = [];
  const itemRe = /<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/g;
  let m;
  while ((m = itemRe.exec(xml)) && items.length < 20) {
    const block = m[0];
    const title = textOf(block, 'title');
    const link = textOf(block, 'link') || (block.match(/<link[^>]*href="([^"]+)"/) || [])[1];
    if (title) items.push({ title: decode(title).trim(), url: link || '' });
  }
  return items;
}
function textOf(block, tag) {
  const m = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>').exec(block);
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '');
}
function decode(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

function defaultConfig() {
  return {
    cities: [
      { id: 'mill_valley', name: 'Mill Valley, CA', tz: 'America/Los_Angeles', latitude: 37.906, longitude: -122.545 },
      { id: 'sparks_nv',   name: 'Sparks, NV',      tz: 'America/Los_Angeles', latitude: 39.535, longitude: -119.755 },
      { id: 'cape_town',   name: 'Cape Town, ZA',   tz: 'Africa/Johannesburg', latitude: -33.925, longitude: 18.424 },
      { id: 'tucson_az',   name: 'Tucson, AZ',      tz: 'America/Phoenix',     latitude: 32.222, longitude: -110.927 }
    ],
    stocks:  [{ id: 'LINE', symbol: 'LINE', name: 'Lineage' }, { id: 'TSLA', symbol: 'TSLA', name: 'Tesla' }],
    indices: [{ id: 'SPX', symbol: 'S&P 500', name: 'S&P 500' }, { id: 'IXIC', symbol: 'Nasdaq', name: 'Nasdaq' }, { id: 'BTC', symbol: 'BTC', name: 'Bitcoin' }],
    newsSources: [{ id: 'nyt', name: 'NYT' }, { id: 'wsj', name: 'WSJ' }, { id: 'atl', name: 'The Atlantic' }]
  };
}

export { defaultConfig };
