// Dashboard client logic. Calls /api/* endpoints, handles 401 by redirecting to /login.

(() => {
  let CONFIG = null;
  let DATA = null;

  // ---------- API helpers ----------
  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: 'same-origin', ...opts });
    if (r.status === 401) { location.replace('/login.html'); throw new Error('unauthorized'); }
    if (!r.ok) {
      let detail;
      try { detail = await r.json(); } catch { detail = await r.text(); }
      throw new Error((detail && detail.error) || ('HTTP ' + r.status));
    }
    if (r.status === 204) return null;
    return r.json();
  }

  async function loadConfig()   { CONFIG = await api('/api/config'); }
  async function saveConfig()   { await api('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(CONFIG) }); }
  async function loadData(force) { DATA = await api('/api/data' + (force ? '?force=1' : '')); }
  async function loadMe()       { return api('/api/auth/me'); }

  // ---------- Header ----------
  function fmtRel(iso) {
    const t = new Date(iso).getTime();
    const diff = (Date.now() - t) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.round(diff/60) + 'm ago';
    if (diff < 86400) return Math.round(diff/3600) + 'h ago';
    return Math.round(diff/86400) + 'd ago';
  }
  function renderHeader() {
    document.getElementById('dateLine').textContent =
      new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const pill = document.getElementById('refreshPill');
    if (DATA && DATA.lastRefresh) {
      const age = (Date.now() - new Date(DATA.lastRefresh).getTime()) / 3600000;
      pill.textContent = 'Data refreshed ' + fmtRel(DATA.lastRefresh);
      pill.classList.toggle('stale', age > 12);
    } else {
      pill.textContent = 'No data yet';
    }
  }

  // ---------- Weather ----------
  function renderWeather() {
    const root = document.getElementById('weatherGrid');
    root.innerHTML = (CONFIG.cities || []).map(c => {
      const w = (DATA && DATA.weather && DATA.weather[c.id]) || null;
      const localTime = (() => {
        try { return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: c.tz }); }
        catch { return ''; }
      })();
      if (!w || w.error) {
        return `<div class="weather-card pending">
          <div class="city">${esc(c.name)} <button class="icon-btn remove" data-rm-city="${esc(c.id)}" title="Remove">✕</button></div>
          <div class="time">${localTime}</div>
          <div class="temp">—°</div>
          <div class="cond"><span class="pending-pill">${w && w.error ? esc(w.error) : 'awaiting refresh'}</span></div>
        </div>`;
      }
      return `<div class="weather-card">
        <div class="city">${esc(c.name)} <button class="icon-btn remove" data-rm-city="${esc(c.id)}" title="Remove">✕</button></div>
        <div class="time">${localTime}</div>
        <div class="temp">${w.icon || ''} ${w.tempF}°<span style="font-size:13px; color:var(--muted); font-weight:400;"> F</span></div>
        <div class="hilo">H ${w.hiF}° &middot; L ${w.loF}°</div>
        <div class="cond">${esc(w.cond || '')}</div>
      </div>`;
    }).join('');
    root.querySelectorAll('[data-rm-city]').forEach(btn => btn.onclick = () => removeCity(btn.getAttribute('data-rm-city')));
  }
  async function removeCity(id) {
    if (!confirm('Remove this city?')) return;
    CONFIG.cities = CONFIG.cities.filter(c => c.id !== id);
    await saveConfig(); renderWeather();
  }
  function addCity() {
    openModal({
      title: 'Add a city',
      body: `
        <label>City name (shown on the card)</label>
        <input id="ncName" placeholder="e.g. Phoenix, AZ" />
        <label>Timezone (IANA, e.g. America/Phoenix)</label>
        <input id="ncTz" placeholder="America/Phoenix" />
        <p style="margin:8px 0 0 0; font-size:11px; color:var(--muted);">Weather lands at the next refresh (use ↻ Refresh).</p>
      `,
      actions: [{ label: 'Add', primary: true, onClick: async () => {
        const name = document.getElementById('ncName').value.trim();
        const tz = document.getElementById('ncTz').value.trim() || 'UTC';
        if (!name) return toast('Name required');
        const id = 'city_' + slug(name);
        if (CONFIG.cities.find(c => c.id === id)) return toast('Already added');
        CONFIG.cities = [...CONFIG.cities, { id, name, tz }];
        await saveConfig(); closeModal(); renderWeather();
      }}, { label: 'Cancel', onClick: closeModal }]
    });
  }

  // ---------- Stocks ----------
  function renderStocks() {
    const root = document.getElementById('stocksList');
    const rows = [];
    (CONFIG.stocks || []).forEach(s => rows.push(stockRow(s, (DATA && DATA.stocks && DATA.stocks[s.id]), false)));
    if ((CONFIG.stocks || []).length && (CONFIG.indices || []).length) rows.push(`<div style="height:6px; border-bottom:1px solid var(--border); margin-bottom:6px;"></div>`);
    (CONFIG.indices || []).forEach(s => rows.push(stockRow(s, (DATA && DATA.indices && DATA.indices[s.id]), true)));
    root.innerHTML = rows.join('');
    root.querySelectorAll('[data-rm-stock]').forEach(btn => btn.onclick = () => removeStock(btn.getAttribute('data-rm-stock'), btn.getAttribute('data-rm-kind')));
  }
  function stockRow(meta, data, isIdx) {
    if (!data || data.error) {
      return `<div class="stock-row">
        <div><div class="sym">${esc(meta.symbol)}</div><div class="name">${esc(meta.name || '')}</div></div>
        <div class="price">—</div>
        <div class="chg flat"><span class="pending-pill">${data && data.error ? esc(data.error) : 'awaiting refresh'}</span></div>
        <button class="icon-btn remove" data-rm-stock="${esc(meta.id)}" data-rm-kind="${isIdx?'idx':'stk'}" title="Remove">✕</button>
      </div>`;
    }
    const dir = data.chg > 0 ? 'up' : data.chg < 0 ? 'down' : 'flat';
    const arrow = dir==='up' ? '▲' : dir==='down' ? '▼' : '·';
    const priceFmt = data.price >= 1000 ? data.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : data.price.toFixed(2);
    const chgFmt = (data.chg > 0 ? '+' : '') + data.chg.toFixed(2);
    const pctFmt = (data.pct > 0 ? '+' : '') + data.pct.toFixed(2) + '%';
    return `<div class="stock-row">
      <div><div class="sym">${esc(meta.symbol)}</div><div class="name">${esc(meta.name || '')}</div></div>
      <div class="price">${priceFmt}</div>
      <div class="chg ${dir}">${arrow} ${chgFmt} (${pctFmt})</div>
      <button class="icon-btn remove" data-rm-stock="${esc(meta.id)}" data-rm-kind="${isIdx?'idx':'stk'}" title="Remove">✕</button>
    </div>`;
  }
  async function removeStock(id, kind) {
    if (!confirm('Remove this from markets?')) return;
    if (kind === 'idx') CONFIG.indices = CONFIG.indices.filter(s => s.id !== id);
    else                CONFIG.stocks  = CONFIG.stocks.filter(s => s.id !== id);
    await saveConfig(); renderStocks();
  }
  function addStock() {
    openModal({
      title: 'Add to markets',
      body: `
        <label>Ticker symbol</label>
        <input id="nsSym" placeholder="e.g. NVDA, ETH, ^GSPC" />
        <label>Display name (optional)</label>
        <input id="nsName" placeholder="e.g. Nvidia" />
        <label>Type</label>
        <select id="nsKind"><option value="stk">Stock / crypto</option><option value="idx">Index</option></select>
      `,
      actions: [{ label: 'Add', primary: true, onClick: async () => {
        const sym = document.getElementById('nsSym').value.trim();
        const name = document.getElementById('nsName').value.trim();
        const kind = document.getElementById('nsKind').value;
        if (!sym) return toast('Symbol required');
        const id = sym.toUpperCase();
        if (kind === 'idx') {
          if (CONFIG.indices.find(s => s.id === id)) return toast('Already added');
          CONFIG.indices = [...CONFIG.indices, { id, symbol: sym, name }];
        } else {
          if (CONFIG.stocks.find(s => s.id === id)) return toast('Already added');
          CONFIG.stocks = [...CONFIG.stocks, { id, symbol: sym, name }];
        }
        await saveConfig(); closeModal(); renderStocks();
      }}, { label: 'Cancel', onClick: closeModal }]
    });
  }

  // ---------- News ----------
  function renderNews() {
    const root = document.getElementById('newsCols');
    root.innerHTML = (CONFIG.newsSources || []).map(src => {
      const items = (DATA && DATA.news && DATA.news[src.id]) || [];
      const body = items.length
        ? items.map(it => `<div class="news-item">${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>` : esc(it.title)}</div>`).join('')
        : `<div class="empty"><span class="pending-pill">awaiting refresh</span></div>`;
      return `<div class="news-col">
        <h3>${esc(src.name)} <button class="icon-btn" data-rm-news="${esc(src.id)}" title="Remove">✕</button></h3>
        ${body}
      </div>`;
    }).join('');
    root.querySelectorAll('[data-rm-news]').forEach(btn => btn.onclick = () => removeNews(btn.getAttribute('data-rm-news')));
  }
  async function removeNews(id) {
    if (!confirm('Remove this news source?')) return;
    CONFIG.newsSources = CONFIG.newsSources.filter(s => s.id !== id);
    await saveConfig(); renderNews();
  }
  function addNews() {
    openModal({
      title: 'Add a news source',
      body: `
        <label>Source name (shown as the column header)</label>
        <input id="nnName" placeholder="e.g. Bloomberg" />
        <label>RSS feed URL (optional; required for non-default sources)</label>
        <input id="nnFeed" placeholder="https://..." />
      `,
      actions: [{ label: 'Add', primary: true, onClick: async () => {
        const name = document.getElementById('nnName').value.trim();
        const feedUrl = document.getElementById('nnFeed').value.trim();
        if (!name) return toast('Name required');
        const id = slug(name);
        if (CONFIG.newsSources.find(s => s.id === id)) return toast('Already added');
        const entry = { id, name };
        if (feedUrl) entry.feedUrl = feedUrl;
        CONFIG.newsSources = [...CONFIG.newsSources, entry];
        await saveConfig(); closeModal(); renderNews();
      }}, { label: 'Cancel', onClick: closeModal }]
    });
  }

  // ---------- Custom widgets ----------
  function renderCustomWidgets() {
    const root = document.getElementById('customWidgetsList');
    const list = CONFIG.customWidgets || [];
    if (!list.length) {
      root.innerHTML = `<div class="empty">No custom widgets yet. Click <b>+ Add widget</b> to start.</div>`;
      return;
    }
    root.innerHTML = list.map(w => {
      if (w.type === 'note') {
        return `<div class="card" style="box-shadow:none;">
          <div class="card-hd"><h2>${esc(w.title || 'Note')}</h2><button class="icon-btn" data-rm-widget="${esc(w.id)}" title="Remove">✕</button></div>
          <div class="card-bd"><textarea class="note-body" data-note-id="${esc(w.id)}">${esc(w.body || '')}</textarea></div>
        </div>`;
      }
      if (w.type === 'link-list') {
        const items = (w.links || []).map(l => `<div class="news-item"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a></div>`).join('') || `<div class="empty">No links yet.</div>`;
        return `<div class="card" style="box-shadow:none;">
          <div class="card-hd"><h2>${esc(w.title || 'Links')}</h2><button class="icon-btn" data-rm-widget="${esc(w.id)}" title="Remove">✕</button></div>
          <div class="card-bd">${items}</div>
        </div>`;
      }
      return '';
    }).join('');
    root.querySelectorAll('[data-rm-widget]').forEach(btn => btn.onclick = () => removeWidget(btn.getAttribute('data-rm-widget')));
    root.querySelectorAll('[data-note-id]').forEach(ta => {
      let saveTimer;
      ta.addEventListener('input', e => {
        const id = e.target.getAttribute('data-note-id');
        const w = (CONFIG.customWidgets || []).find(x => x.id === id);
        if (w) w.body = e.target.value;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveConfig, 600);
      });
    });
  }
  async function removeWidget(id) {
    if (!confirm('Remove this widget?')) return;
    CONFIG.customWidgets = (CONFIG.customWidgets || []).filter(w => w.id !== id);
    await saveConfig(); renderCustomWidgets();
  }
  function addWidget() {
    openModal({
      title: 'Add a widget',
      body: `
        <p style="margin:0 0 10px 0; font-size:13px; color:#3f3f46;">Pick a type. Both save instantly to your account.</p>
        <div class="widget-grid">
          <button class="widget-option" data-w="note"><div class="title">📝 Note</div><div class="desc">Free-form text saved to your dashboard.</div></button>
          <button class="widget-option" data-w="link-list"><div class="title">🔗 Link list</div><div class="desc">A list of saved URLs (bookmarks).</div></button>
        </div>
      `,
      actions: [{ label: 'Cancel', onClick: closeModal }]
    });
    document.querySelectorAll('[data-w]').forEach(b => b.onclick = () => widgetDetails(b.getAttribute('data-w')));
  }
  function widgetDetails(type) {
    const id = type + '_' + Math.random().toString(36).slice(2, 8);
    if (type === 'note') {
      openModal({
        title: 'New note widget',
        body: `<label>Title</label><input id="nwTitle" value="Note" /><label>Initial content (optional)</label><textarea id="nwBody" rows="3"></textarea>`,
        actions: [{ label: 'Add', primary: true, onClick: async () => {
          const title = (document.getElementById('nwTitle').value || 'Note').trim();
          const body = document.getElementById('nwBody').value;
          CONFIG.customWidgets = [...(CONFIG.customWidgets || []), { id, type: 'note', title, body }];
          await saveConfig(); closeModal(); renderCustomWidgets();
        }}, { label: 'Back', onClick: addWidget }]
      });
    } else if (type === 'link-list') {
      openModal({
        title: 'New link list',
        body: `<label>Title</label><input id="nwTitle" value="Quick links" />
               <label>Links (one per line: <code>Label | https://url</code>)</label>
               <textarea id="nwLinks" rows="5" placeholder="Gmail | https://mail.google.com"></textarea>`,
        actions: [{ label: 'Add', primary: true, onClick: async () => {
          const title = (document.getElementById('nwTitle').value || 'Links').trim();
          const raw = document.getElementById('nwLinks').value;
          const links = raw.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
            const ix = l.indexOf('|');
            if (ix < 0) return { label: l, url: l };
            return { label: l.slice(0, ix).trim(), url: l.slice(ix + 1).trim() };
          });
          CONFIG.customWidgets = [...(CONFIG.customWidgets || []), { id, type: 'link-list', title, links }];
          await saveConfig(); closeModal(); renderCustomWidgets();
        }}, { label: 'Back', onClick: addWidget }]
      });
    }
  }

  // ---------- Calendar (live) ----------
  async function loadCalendar() {
    const root = document.getElementById('calList');
    root.innerHTML = `<div class="loading">Loading today's calendar…</div>`;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
      const res = await api('/api/calendar/today?tz=' + encodeURIComponent(tz));
      const events = res.events || [];
      if (!events.length) { root.innerHTML = `<div class="empty">Nothing on the calendar today.</div>`; return; }
      root.innerHTML = events.map(ev => {
        const isAllDay = ev.allDay;
        let when;
        if (isAllDay) when = '<span class="all-day">all day</span>';
        else {
          const s = new Date(ev.start.dateTime);
          when = s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        }
        const loc = ev.location ? `<div class="cal-loc">${esc(ev.location)}</div>` : '';
        return `<div class="cal-item"><div class="cal-time">${when}</div><div><div class="cal-title">${esc(ev.summary || '(no title)')}</div>${loc}</div></div>`;
      }).join('');
    } catch (e) {
      root.innerHTML = `<div class="err">Couldn't load calendar: ${esc(e.message)}</div>`;
    }
  }

  // ---------- Email (live) ----------
  async function loadEmail() {
    const root = document.getElementById('emailList');
    root.innerHTML = `<div class="loading">Loading unread email…</div>`;
    try {
      const res = await api('/api/email/unread');
      const threads = res.threads || [];
      if (!threads.length) { root.innerHTML = `<div class="empty">Inbox is empty for the last 24 hours.</div>`; return; }
      root.innerHTML = threads.map(t => `<div class="email-item">
        <div><div class="email-subject">${esc(t.subject)}</div><div class="email-sender">${esc(t.sender)}</div></div>
        <div class="email-time">${t.date ? esc(fmtRel(t.date)) : ''}</div>
      </div>`).join('');
    } catch (e) {
      root.innerHTML = `<div class="err">Couldn't load email: ${esc(e.message)}</div>`;
    }
  }

  // ---------- Modal + helpers ----------
  function openModal({ title, body, actions }) {
    const root = document.getElementById('modalRoot');
    root.innerHTML = `<div class="modal-mask"><div class="modal"><h3>${esc(title)}</h3><div>${body}</div>
      <div class="actions">${(actions || []).map((a,i) => `<button class="btn ${a.primary?'primary':''}" data-act="${i}">${esc(a.label)}</button>`).join('')}</div></div></div>`;
    (actions || []).forEach((a, i) => root.querySelector(`[data-act="${i}"]`).onclick = () => a.onClick && a.onClick());
    root.querySelector('.modal-mask').addEventListener('click', e => { if (e.target.classList.contains('modal-mask')) closeModal(); });
  }
  function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40) || ('id_' + Math.random().toString(36).slice(2,7)); }
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // ---------- Boot ----------
  async function boot() {
    let me;
    try { me = await loadMe(); } catch { return; } // 401 already redirected
    document.getElementById('userChip').innerHTML = esc(me.email) + ' &middot; <a href="#" id="logoutLink">sign out</a>';
    document.getElementById('logoutLink').onclick = async (e) => {
      e.preventDefault();
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      location.replace('/login.html');
    };
    try {
      await loadConfig();
      await loadData(false);
    } catch (e) {
      toast('Initial load failed: ' + e.message);
    }
    renderHeader();
    renderWeather(); renderStocks(); renderNews(); renderCustomWidgets();
    loadCalendar(); loadEmail();
    setInterval(renderWeather, 60_000);
  }

  // Wire buttons
  document.getElementById('addCityBtn').onclick   = addCity;
  document.getElementById('addStockBtn').onclick  = addStock;
  document.getElementById('addNewsBtn').onclick   = addNews;
  document.getElementById('addWidgetBtn').onclick = addWidget;
  document.getElementById('reloadCalBtn').onclick = loadCalendar;
  document.getElementById('reloadEmailBtn').onclick = loadEmail;
  document.getElementById('refreshBtn').onclick = async () => {
    const pill = document.getElementById('refreshPill');
    pill.textContent = 'Refreshing…';
    try { await loadData(true); }
    catch (e) { toast('Refresh failed: ' + e.message); }
    renderHeader(); renderWeather(); renderStocks(); renderNews();
  };
  document.getElementById('resetCitiesBtn').onclick = async () => {
    if (!confirm('Restore default cities?')) return;
    CONFIG.cities = null; // server falls back to defaults if cities is empty-ish
    const fresh = await api('/api/config');
    CONFIG = { ...fresh, cities: fresh.cities };
    await saveConfig(); renderWeather();
  };
  document.getElementById('resetStocksBtn').onclick = async () => {
    if (!confirm('Restore default markets list?')) return;
    const fresh = await (await fetch('/api/config')).json();
    CONFIG.stocks = fresh.stocks; CONFIG.indices = fresh.indices;
    await saveConfig(); renderStocks();
  };
  document.getElementById('resetNewsBtn').onclick = async () => {
    if (!confirm('Restore default news sources?')) return;
    const fresh = await (await fetch('/api/config')).json();
    CONFIG.newsSources = fresh.newsSources;
    await saveConfig(); renderNews();
  };

  boot();
})();
