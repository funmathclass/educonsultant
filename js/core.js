/**
 * ============================================================
 * PORTOFOLIO — core.js (dipakai halaman publik & admin)
 * - api()      : fetch POST ke GAS (text/plain → tanpa preflight CORS),
 *                timeout, retry bertahap, tunggu online, idempotensi reqId.
 * - apiGet()   : GET konten publik.
 * - Store      : localStorage berversi (aman saat penuh/diblokir).
 * - Perf       : catat waktu total vs waktu server → ketik PF.Perf.table() di Console.
 * ============================================================
 */
(function () {
  'use strict';

  const CFG = window.PF_CONFIG || {};
  // Daftar ikon yang ada di subset font (diisi otomatis oleh skrip build).
  window.PF_ICONS = /*@@ICONS*/{"activity":1,"amazon":1,"android2":1,"apple":1,"arrow-clockwise":1,"arrow-left":1,"arrow-repeat":1,"arrow-right":1,"arrow-up":1,"arrow-up-right":1,"arrow-up-short":1,"award":1,"bag":1,"bank":1,"bar-chart":1,"bar-chart-line":1,"behance":1,"bell":1,"bezier2":1,"book":1,"bootstrap":1,"box-arrow-left":1,"box-arrow-up-right":1,"box-seam":1,"boxes":1,"bricks":1,"briefcase":1,"brush":1,"buildings":1,"calculator":1,"calendar-event":1,"calendar3":1,"camera":1,"camera-video":1,"cart":1,"cash-stack":1,"chat-dots":1,"chat-quote":1,"chat-square-text":1,"check-circle":1,"check-circle-fill":1,"check-lg":1,"check2":1,"check2-circle":1,"check2-square":1,"chevron-down":1,"chevron-left":1,"chevron-right":1,"chevron-up":1,"clipboard-data":1,"clock":1,"clock-history":1,"cloud":1,"cloud-upload":1,"code-slash":1,"columns-gap":1,"compass":1,"controller":1,"copy":1,"cpu":1,"cup-hot":1,"currency-dollar":1,"cursor":1,"database":1,"diagram-2":1,"diagram-3":1,"discord":1,"display":1,"dot":1,"download":1,"dribbble":1,"easel":1,"emoji-smile":1,"envelope":1,"envelope-open":1,"envelope-paper":1,"exclamation-circle":1,"exclamation-triangle":1,"exclamation-triangle-fill":1,"eye":1,"eyedropper":1,"facebook":1,"file":1,"file-earmark-pdf":1,"file-earmark-spreadsheet":1,"filetype-css":1,"filetype-html":1,"filetype-js":1,"filetype-py":1,"filetype-sql":1,"film":1,"fingerprint":1,"flag":1,"floppy":1,"folder2-open":1,"fonts":1,"gear":1,"geo-alt":1,"git":1,"github":1,"gitlab":1,"globe":1,"globe2":1,"google":1,"graph-up":1,"graph-up-arrow":1,"grid":1,"grid-1x2":1,"grid-3x3-gap":1,"hammer":1,"hand-index":1,"hand-thumbs-up":1,"headset":1,"heart":1,"house":1,"image":1,"images":1,"inbox":1,"inboxes":1,"info":1,"info-circle":1,"info-circle-fill":1,"instagram":1,"journal-code":1,"journal-text":1,"joystick":1,"kanban":1,"kanban-fill":1,"key":1,"keyboard":1,"laptop":1,"layers":1,"lightbulb":1,"lightning-charge":1,"line":1,"link":1,"link-45deg":1,"linkedin":1,"list":1,"list-check":1,"lock":1,"map":1,"mastodon":1,"medium":1,"megaphone":1,"memory":1,"messenger":1,"mic":1,"microsoft":1,"moon-stars":1,"mortarboard":1,"mouse":1,"music-note-beamed":1,"palette":1,"palette2":1,"patch-check-fill":1,"paypal":1,"pen":1,"pencil":1,"pencil-square":1,"people":1,"person-badge":1,"person-circle":1,"person-lines-fill":1,"person-vcard":1,"person-workspace":1,"phone":1,"pie-chart":1,"pinterest":1,"play":1,"play-fill":1,"plus-lg":1,"puzzle":1,"question-circle":1,"quote":1,"reddit":1,"reply":1,"robot":1,"rocket-takeoff":1,"router":1,"search":1,"search-heart":1,"send":1,"server":1,"share":1,"shield-check":1,"shield-lock":1,"shield-x":1,"shop":1,"signal":1,"skype":1,"slack":1,"snapchat":1,"speedometer2":1,"spotify":1,"stack":1,"stack-overflow":1,"star-fill":1,"stars":1,"substack":1,"sun":1,"table":1,"tablet":1,"telegram":1,"telephone":1,"terminal":1,"textarea":1,"threads":1,"three-dots":1,"tiktok":1,"tools":1,"translate":1,"trash3":1,"tree":1,"trophy":1,"truck":1,"twitch":1,"twitter":1,"twitter-x":1,"type":1,"ubuntu":1,"upload":1,"vector-pen":1,"vimeo":1,"wechat":1,"whatsapp":1,"wifi":1,"wifi-off":1,"window":1,"window-stack":1,"windows":1,"wrench":1,"x":1,"x-circle":1,"x-circle-fill":1,"x-lg":1,"youtube":1};
  const GAS_URL = String(CFG.GAS_URL || '').trim();
  const configured = /^https:\/\/script\.google\.com\/macros\/.+\/exec$/.test(GAS_URL) && !/XXXX/.test(GAS_URL);

  // ── DOM & teks ─────────────────────────────────────────────
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const plain = (s) => String(s === null || s === undefined ? '' : s).replace(/^'/, '');
  const esc = (s) => plain(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (v) => String(v || '').toLowerCase().replace(/^bi-/, '').replace(/[^a-z0-9-]/g, '') || 'link-45deg';
  const safeUrl = (u) => (/^https:\/\/[^\s<>"']+$/i.test(String(u || '')) ? String(u) : '');
  const initials = (name) => plain(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
  const UNDERLINE = '<svg viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true"><path d="M3 9 C 50 2, 120 2, 197 7" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>';
  /** Teks dengan *kata aksen* → kata dibungkus font tulisan tangan. */
  const accent = (txt, underline) => esc(txt).replace(/\*([^*]+)\*/g, (_, w) =>
    underline ? `<span class="accent accent-u">${w}${UNDERLINE}</span>` : `<span class="accent">${w}</span>`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  /** ID permintaan unik untuk aksi tulis (dipakai server sebagai kunci idempotensi). */
  const rid = (p) => (p || 'r') + '_' + uuid().replace(/-/g, '').slice(0, 24);

  // ── Penyimpanan lokal berversi ─────────────────────────────
  const PREFIX = 'pf2:';
  const memory = {};
  let lsOk = true;
  try { localStorage.setItem(PREFIX + 't', '1'); localStorage.removeItem(PREFIX + 't'); } catch (e) { lsOk = false; }
  const Store = {
    get(k, d) {
      try { const v = lsOk ? localStorage.getItem(PREFIX + k) : memory[k]; return v === null || v === undefined ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set(k, v) {
      const s = JSON.stringify(v);
      if (!lsOk) { memory[k] = s; return; }
      try { localStorage.setItem(PREFIX + k, s); } catch (e) {
        // Penyimpanan penuh → buang cache besar yang bisa dibangun ulang, coba sekali lagi.
        try { ['adm:data', 'pub'].forEach((x) => { if (x !== k) localStorage.removeItem(PREFIX + x); }); localStorage.setItem(PREFIX + k, s); } catch (e2) { memory[k] = s; }
      }
    },
    del(k) { try { if (lsOk) localStorage.removeItem(PREFIX + k); delete memory[k]; } catch (e) { /* abaikan */ } }
  };
  const ssn = {
    get(k) { try { return sessionStorage.getItem(PREFIX + k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(PREFIX + k, v); } catch (e) { /* abaikan */ } }
  };

  // ── Pengukur performa (Prinsip 0) ──────────────────────────
  const Perf = {
    rows: [],
    add(action, total, server) {
      this.rows.push({ action, total: Math.round(total), server: server == null ? null : server, net: server == null ? null : Math.round(total - server), at: new Date().toLocaleTimeString() });
      if (this.rows.length > 200) this.rows.shift();
    },
    table() { console.table(this.rows.slice(-30)); }
  };

  // ── Jaringan ───────────────────────────────────────────────
  function waitOnline(max) {
    if (navigator.onLine !== false) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { window.removeEventListener('online', done); clearTimeout(t); resolve(); };
      const t = setTimeout(done, max || 15000);
      window.addEventListener('online', done);
    });
  }

  /** fetch + timeout + validasi JSON. Melempar error yang bisa di-retry. */
  async function fetchJson(url, init, timeout) {
    const ctl = 'AbortController' in window ? new AbortController() : null;
    const tm = ctl ? setTimeout(() => ctl.abort(), timeout || 25000) : null;
    try {
      const r = await fetch(url, Object.assign({ redirect: 'follow', credentials: 'omit', cache: 'no-store' }, init, ctl ? { signal: ctl.signal } : {}));
      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch (e) {
        const err = new Error(/<html|<!DOCTYPE/i.test(text) ? 'Server mengirim halaman, bukan data. Pastikan GAS sudah dideploy dengan akses "Anyone".' : 'Respons server tidak valid.');
        err.retry = true; throw err;
      }
      return json;
    } catch (e) {
      if (e && e.name === 'AbortError') { const err = new Error('Server terlalu lama merespons.'); err.retry = true; err.timeout = true; throw err; }
      if (e && !('retry' in e)) e.retry = true;   // TypeError: Failed to fetch, dll.
      throw e;
    } finally { if (tm) clearTimeout(tm); }
  }

  const READ_ACTIONS = { adminBootstrap: 1, adminGate: 1, events: 1, ping: 1 };
  let onToken = null;

  /**
   * Panggil API GAS (POST). opts:
   *  token   : token admin
   *  reqId   : wajib untuk aksi tulis agar aman di-retry (otomatis dibuat bila retry diminta)
   *  tries   : jumlah percobaan (default: baca 3, tulis-dengan-reqId 3, lainnya 1)
   *  timeout : ms percobaan pertama (default 25 dtk; berikutnya 40 dtk)
   *  keepalive: true untuk kiriman saat halaman ditutup
   */
  async function api(action, data, opts) {
    const o = opts || {};
    if (!configured) return { success: false, message: 'GAS_URL di js/config.js belum diisi.', code: 'NO_CONFIG' };
    const body = { action, data: data || {} };
    if (o.token) body.token = o.token;
    if (o.reqId) body.reqId = o.reqId;
    const read = !!READ_ACTIONS[action];
    const tries = o.tries || (read || o.reqId ? 3 : 1);
    const payload = JSON.stringify(body);
    let last = null;
    for (let i = 0; i < tries; i++) {
      if (i > 0) await sleep(Math.min(8000, 700 * Math.pow(2, i - 1)) + Math.random() * 300);
      await waitOnline(o.offlineWait || 20000);
      const t0 = performance.now();
      try {
        const res = await fetchJson(GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: payload,
          keepalive: !!o.keepalive && payload.length < 60000
        }, i === 0 ? (o.timeout || 25000) : Math.max(o.timeout || 0, 40000));
        Perf.add(action, performance.now() - t0, res && res.ms);
        if (res && res.token && onToken) { try { onToken(res.token); } catch (e) { /* abaikan */ } }
        return res || { success: false, message: 'Respons kosong.' };
      } catch (e) {
        last = e;
        Perf.add(action + ' ✗', performance.now() - t0, null);
        if (!e.retry) break;
      }
    }
    return { success: false, network: true, code: 'NETWORK', message: friendlyNet(last) };
  }

  function friendlyNet(e) {
    if (navigator.onLine === false) return 'Perangkat sedang offline. Periksa koneksi internet.';
    if (e && e.timeout) return 'Server sedang lambat merespons. Coba lagi sebentar.';
    return (e && e.message && !/Failed to fetch|NetworkError|Load failed/i.test(e.message)) ? e.message : 'Koneksi ke server bermasalah. Coba lagi sebentar.';
  }

  /** GET konten publik. h = hash yang sudah dimiliki (server menjawab { same:true } bila sama). */
  async function apiGet(params, opts) {
    const o = opts || {};
    if (!configured) throw new Error('GAS_URL di js/config.js belum diisi.');
    const q = Object.keys(params).filter((k) => params[k] !== undefined && params[k] !== '').map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    let last;
    for (let i = 0; i < (o.tries || 3); i++) {
      if (i > 0) await sleep(800 * Math.pow(2, i - 1));
      await waitOnline(15000);
      const t0 = performance.now();
      try {
        const res = await fetchJson(GAS_URL + '?' + q, { method: 'GET' }, i === 0 ? (o.timeout || 20000) : 35000);
        Perf.add('GET ' + (params.action || ''), performance.now() - t0, res && res.ms);
        return res;
      } catch (e) { last = e; if (!e.retry) break; }
    }
    throw new Error(friendlyNet(last));
  }

  /** Alamat snapshot Mode Turbo (opsional). TURBO: true → diturunkan dari alamat GitHub Pages. */
  function turboUrl() {
    const t = CFG.TURBO;
    if (!t) return '';
    if (typeof t === 'string') return /^https:\/\//.test(t) ? t : '';
    const m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname);
    if (!m) return '';
    const seg = location.pathname.split('/').filter(Boolean);
    const repo = seg.length && !/\.html?$/i.test(seg[0]) ? seg[0] : m[1] + '.github.io';
    return 'https://raw.githubusercontent.com/' + m[1] + '/' + repo + '/' + (CFG.TURBO_BRANCH || 'turbo-data') + '/content.json';
  }

  // ── UI kecil ───────────────────────────────────────────────
  /** Toast non-blocking. opts: { action, onAction, duration } */
  function toast(msg, type, opts) {
    type = type || 'info'; opts = opts || {};
    let box = $('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const ic = { success: 'check-circle-fill', error: 'x-circle-fill', warning: 'exclamation-triangle-fill', info: 'info-circle-fill' }[type] || 'info-circle-fill';
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `<i class="bi bi-${ic}" aria-hidden="true"></i><div class="t-body">${esc(msg)}</div>${opts.action ? `<button type="button">${esc(opts.action)}</button>` : ''}`;
    let done = false;
    const close = () => { if (done) return; done = true; el.classList.add('out'); setTimeout(() => el.remove(), 220); };
    if (opts.action) $('button', el).addEventListener('click', () => { if (opts.onAction) opts.onAction(); close(); });
    box.appendChild(el);
    setTimeout(close, opts.duration || (type === 'error' ? 6000 : 3800));
    return { close };
  }

  // ── Tema (warna utama dari Pengaturan) ─────────────────────
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const shade = (rgb, f) => '#' + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c * f))).toString(16).padStart(2, '0')).join('');
  function luminance(rgb) {
    const a = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function applyTheme(settings) {
    const rgb = hexToRgb(settings && settings.warna_utama);
    if (!rgb) return;
    const root = document.documentElement.style;
    root.setProperty('--primary', '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join(''));
    root.setProperty('--primary-600', shade(rgb, 0.84));
    root.setProperty('--primary-rgb', rgb.join(', '));
    root.setProperty('--on-primary', luminance(rgb) > 0.42 ? '#0B1F3A' : '#FFFFFF');
  }

  // ── Pustaka CDN (dimuat sekali, hanya saat dibutuhkan) ─────
  const _scripts = {};
  function loadScript(src) {
    if (_scripts[src]) return _scripts[src];
    _scripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = () => resolve();
      s.onerror = () => { delete _scripts[src]; reject(new Error('Gagal memuat pustaka ' + src.split('/').pop() + '. Periksa koneksi internet.')); };
      document.head.appendChild(s);
    });
    return _scripts[src];
  }

  /**
   * Ikon Bootstrap disubset agar ringan. Jika data memakai ikon di luar subset,
   * stylesheet ikon lengkap dimuat otomatis dari CDN (sekali saja).
   */
  let fullIcons = false;
  function ensureIcons(names) {
    if (fullIcons || !window.PF_ICONS) return;
    const missing = names.map(icon).filter((n) => n && !window.PF_ICONS[n]);
    if (!missing.length) return;
    fullIcons = true;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css';
    document.head.appendChild(l);
  }

  function deviceType() {
    const w = Math.min(window.innerWidth || 1200, (screen && screen.width) || 1200);
    const ua = navigator.userAgent || '';
    if (/iPad|Tablet/i.test(ua) || (w >= 600 && w < 1024 && /Android|Mobi/i.test(ua))) return 'tablet';
    if (/Mobi|Android|iPhone/i.test(ua) || w < 600) return 'mobile';
    return w < 1024 ? 'tablet' : 'desktop';
  }

  window.PF = {
    CFG, GAS_URL, configured, $, $$, esc, plain, icon, safeUrl, initials, accent, sleep, uuid, rid,
    Store, ssn, Perf, api, apiGet, turboUrl, toast, applyTheme, loadScript, ensureIcons, deviceType,
    setTokenHandler(fn) { onToken = fn; }
  };
})();
