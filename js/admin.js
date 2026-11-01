/**
 * ============================================================
 * PANEL ADMIN — js/admin.js (GitHub Pages + GAS REST API)
 * Prinsip gas-instant-ux-pro:
 *  1. SPA: 1 panggilan memuat SEMUA data → pindah menu 0 ms (show/hide section).
 *  2. SWR: dashboard tampil SEKETIKA dari cache perangkat, disegarkan di latar.
 *  3. Optimistic UI + reqId: simpan/hapus/toggle langsung tampil, sinkron di latar,
 *     aman di-retry saat sinyal putus, otomatis dibatalkan jika server menolak.
 *  4. Login (1 panggilan = token + seluruh data): akun Google via server
 *     (tanpa OAuth), kata sandi cadangan, atau Google Identity Services.
 *  5. Grafik & laporan dihitung di browser dari data agregat (tanpa round-trip).
 * ============================================================
 */
(function () {
  'use strict';
  const P = window.PF;
  const { esc, toast, icon, safeUrl, initials, uuid } = P;
  const LS = P.Store;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  const CDN = {
    chart: 'https:\/\/cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.js',
    gis: 'https:\/\/accounts.google.com/gsi/client',
    xlsx: 'https:\/\/cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    jspdf: 'https:\/\/cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    autotable: 'https:\/\/cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'
  };
  // Palet perangkat tervalidasi (validate_palette.js: lolos CVD & lightness band)
  const DEV_COLOR = { desktop: '#2563EB', mobile: '#E0A100', tablet: '#0F9D8F' };
  const DEV_LABEL = { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet' };
  const EV_LABEL = { kunjungan: 'Kunjungan', klik_proyek: 'Klik Proyek', klik_kontak: 'Klik Kontak', klik_cta: 'Klik CTA' };
  const EV_ICON = { kunjungan: 'eye', klik_proyek: 'cursor', klik_kontak: 'send', klik_cta: 'hand-index' };
  const SKEY = 'adm:sess', DKEY = 'adm:data', RKEY = 'adm:route', KKEY = 'adm:k', GKEY = 'adm:gate';
  const MAX_IMG = 2 * 1024 * 1024;

  const ROUTES = [
    ['beranda', 'Beranda', 'grid-1x2'],
    ['profil', 'Profil', 'person-circle'],
    ['tentang', 'Tentang', 'person-vcard'],
    ['keahlian', 'Keahlian', 'stars'],
    ['portofolio', 'Portofolio', 'folder2-open'],
    ['testimoni', 'Testimoni', 'chat-quote'],
    ['kontak', 'Kontak & Sosial', 'share'],
    ['pesan', 'Pesan Masuk', 'inbox'],
    ['statistik', 'Statistik & Laporan', 'bar-chart-line'],
    ['pengaturan', 'Pengaturan', 'gear']
  ];
  const ROUTE = {}; ROUTES.forEach(([r, t, i]) => { ROUTE[r] = { t, i }; });
  const KONTEN = ['profil', 'tentang', 'keahlian', 'portofolio', 'testimoni', 'kontak'];

  const A = {
    key: '', clientId: '', appUrl: '', token: '', user: null, d: null, lastD: null,
    route: 'beranda', charts: {}, chartFns: {}, pending: 0, failed: false, lastFetch: 0,
    uploads: {}, form: null, bound: false, gisInit: false,
    ui: {
      crud: {},
      pesan: { q: '', status: 'semua', range: 'all', sel: new Set(), open: null, page: 0 },
      stat: { preset: '30', from: '', to: '', type: 'semua', q: '', tab: 'log', page: 0 },
      home: 30, set: null, setDirty: false, prof: null, profDirty: false, showUrl: false
    }
  };

  // ════════════════════════════════════════════════════════
  // BAGIAN 1: UTILITAS
  // ════════════════════════════════════════════════════════
  const fmt = (n) => Number(n || 0).toLocaleString('id-ID');
  const pad = (n) => String(n).padStart(2, '0');
  const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const parseDay = (s) => new Date(s + 'T00:00:00');
  const plain = (s) => String(s === null || s === undefined ? '' : s).replace(/^'/, '');
  const MARKUP = /<\s*\/?\s*[a-z!]|javascript\s*:/i;
  const isHttps = (v) => /^https:\/\/[^\s<>"']+$/i.test(String(v || ''));
  const isEmail = (v) => /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/.test(String(v || ''));
  const byUrut = (a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0);
  const isOn = (v) => v === true || String(v).toUpperCase() === 'TRUE';

  function timeLabel(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const now = new Date();
    const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (dstr(d) === dstr(now)) return 'Hari ini, ' + hm;
    if (dstr(d) === dstr(addDays(now, -1))) return 'Kemarin, ' + hm;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  }
  function fullDate(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function shortDate(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const loadOnce = P.loadScript;

  /**
   * Nama fungsi lama (google.script.run) → aksi REST baru.
   * Dipertahankan agar modul CRUD, pesan, profil & pengaturan tidak perlu diubah.
   */
  const ACTIONS = {
    adminUpsert: (sheet, record) => ['upsert', { sheet, record }],
    adminDelete: (sheet, ids) => ['delete', { sheet, ids }],
    adminReorder: (sheet, ids) => ['reorder', { sheet, ids }],
    adminSetPesanStatus: (ids, status) => ['pesanStatus', { ids, status }],
    adminSaveProfil: (p) => ['saveProfil', p],
    adminSaveSettings: (s) => ['saveSettings', s],
    adminUploadImage: (b64, mime, name, kind) => ['uploadImage', { b64, mime, name, kind }],
    adminRegenerateKey: () => ['regenerateKey', {}],
    adminRefresh: () => ['adminBootstrap', {}]
  };
  const WRITES = { upsert: 1, delete: 1, reorder: 1, pesanStatus: 1, saveProfil: 1, saveSettings: 1, uploadImage: 1, regenerateKey: 1, setPassword: 1 };

  /** Panggilan server bertoken. Aksi tulis otomatis diberi reqId (aman di-retry). Sesi habis → layar login. */
  function call(fn, ...args) {
    const pair = ACTIONS[fn] ? ACTIONS[fn](...args) : [fn, args[0] || {}];
    const action = pair[0];
    const opts = { token: A.token };
    if (WRITES[action]) {
      opts.reqId = P.rid(action.slice(0, 6));
      opts.tries = action === 'uploadImage' ? 2 : 4;
      opts.timeout = action === 'uploadImage' ? 60000 : 25000;
    }
    return P.api(action, pair[1], opts).then((res) => {
      if (res && !res.success && res.code === 'AUTH') {
        authLost(res.message);
        const e = new Error(res.message); e.auth = true; throw e;
      }
      return res;
    });
  }

  /** Sinkron latar belakang untuk aksi optimistic. onFail = rollback. */
  function sync(fn, args, onFail) {
    A.pending++; renderSync();
    return call(fn, ...args).then((res) => {
      if (!res || !res.success) throw new Error((res && res.message) || 'Gagal menyimpan ke server.');
      A.failed = false;
      return res;
    }).catch((err) => {
      A.failed = true;
      if (onFail) { try { onFail(err); } catch (e) { /* abaikan */ } }
      if (!err.auth) toast((err && err.message) || 'Gagal menyinkronkan perubahan.', 'error');
      return null;
    }).finally(() => { A.pending = Math.max(0, A.pending - 1); renderSync(); persist(); });
  }

  function renderSync() {
    const el = $('#syncState');
    if (!el) return;
    el.classList.toggle('busy', A.pending > 0);
    el.classList.toggle('fail', !A.pending && A.failed);
    $('.t', el).textContent = A.pending > 0 ? `Menyinkronkan… (${A.pending})` : A.failed ? 'Gagal sinkron' : 'Tersimpan';
  }
  function persist() { if (A.d && A.token) { LS.set(DKEY, A.d); A.lastD = A.d; } }

  function screen(id) {
    ['admLogin', 'admDenied', 'admOut', 'admLoading', 'admApp', 'admNoKey'].forEach((x) => { $('#' + x).hidden = x !== id; });
    if (id !== 'admApp') closeSheet();
    window.scrollTo(0, 0);
  }

  function copyText(text, input) {
    const done = () => toast('Disalin ke clipboard.', 'success');
    const fallback = () => {
      if (input) { input.type = 'text'; input.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Salin manual: tekan Ctrl+C.', 'info'); } }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  // ════════════════════════════════════════════════════════
  // BAGIAN 2: START, LOGIN & SESI
  // ════════════════════════════════════════════════════════
  const siteUrl = () => './';                       // index.html di folder yang sama
  const adminUrl = (k) => location.origin + location.pathname + '#k=' + encodeURIComponent(k || A.key);
  const canReplace = () => A.pending === 0 && !A.ui.setDirty && !A.ui.profDirty && !$('#formModal.open');

  function saveSess() { if (A.token) LS.set(SKEY, { token: A.token, user: A.user }); }

  /** Baca #k=…&sso=…&pw=1 lalu bersihkan alamat (kunci tidak tertinggal di riwayat browser). */
  function readHash() {
    const h = location.hash.replace(/^#/, '');
    const p = {};
    h.split('&').forEach((kv) => {
      const i = kv.indexOf('=');
      if (i > 0) { try { p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* abaikan */ } }
    });
    if (h) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* abaikan */ } }
    return p;
  }

  function start() {
    bindStatic();
    document.title = 'Admin — Portofolio';
    P.setTokenHandler((t) => { A.token = t; saveSess(); });   // token diperpanjang otomatis oleh server
    const q = readHash();
    if (q.k && /^[A-Za-z0-9]{10,64}$/.test(q.k) && q.k !== LS.get(KKEY)) { LS.set(KKEY, q.k); LS.del(GKEY); }
    A.key = LS.get(KKEY) || '';
    A.route = LS.get(RKEY) || 'beranda';
    if (!P.configured) { noKey('Belum dikonfigurasi', 'GAS_URL di js/config.js belum diisi. Ikuti PANDUAN-INSTALASI.md bagian 4.'); return; }
    if (!A.key) { noKey(); return; }
    if (q.sso) { exchangeSso(q.sso); return; }

    const saved = LS.get(SKEY);
    if (saved && saved.token) {
      A.token = saved.token; A.user = saved.user;
      const cached = LS.get(DKEY);
      if (cached) boot(cached, true); else screen('admLoading');   // SWR: tampil seketika dari cache
      call('adminRefresh').then((res) => {
        if (res && res.success) { A.lastFetch = Date.now(); if (canReplace()) boot(res.data, true); }
        else if (!cached) showLogin((res && res.message) || 'Gagal memuat dashboard.', 'error');
        else if (res && res.network) toast('Menampilkan data tersimpan. ' + res.message, 'warning');
      }).catch(() => { /* sesi habis → sudah dialihkan ke login */ });
      return;
    }
    showLogin(null, null, q.pw === '1');
  }

  function noKey(title, msg) {
    screen('admNoKey');
    if (title) $('#noKeyTitle').textContent = title;
    if (msg) $('#noKeyMsg').textContent = msg;
  }

  function loginMsg(msg, type) {
    const el = $('#loginMsg');
    if (!msg) { el.hidden = true; return; }
    const ic = { error: 'x-circle', warning: 'exclamation-triangle', info: 'info-circle' }[type] || 'info-circle';
    el.className = 'login-msg ' + (type || 'info');
    el.innerHTML = `<i class="bi bi-${ic}" aria-hidden="true"></i><span>${esc(msg)}</span>`;
    el.hidden = false;
  }
  function loginBusy(on, text) {
    $('#loginBusy').hidden = !on;
    $('#loginBusyTxt').textContent = text || 'Memverifikasi akun…';
    $('#loginBtns').hidden = on;
  }

  /**
   * Layar login. Opsi (kata sandi aktif? GIS?) diambil dari server lalu dicache,
   * sehingga kunjungan berikutnya layar login langsung lengkap tanpa menunggu.
   */
  function showLogin(msg, type, focusPw) {
    screen('admLogin');
    loginBusy(false);
    loginMsg(msg, type || 'warning');
    const g = LS.get(GKEY);
    if (g) applyGate(g, focusPw);
    P.api('adminGate', { k: A.key, site: location.origin + location.pathname }).then((res) => {
      if (res && res.success) { LS.set(GKEY, res.data); applyGate(res.data, focusPw && !g); return; }
      if (res && res.code === 'BAD_KEY') { LS.del(KKEY); LS.del(GKEY); noKey('Alamat admin tidak valid', res.message); return; }
      if (!g && !msg) loginMsg((res && res.message) || 'Server belum bisa dihubungi.', 'error');
    });
  }

  function applyGate(g, focusPw) {
    A.gate = g;
    $('#pwWrap').hidden = !g.password;
    $('#pwOff').hidden = !!g.password;
    $('#loginHint').textContent = g.emailHint ? 'Akun admin: ' + g.emailHint : '';
    if (focusPw && g.password) { $('#pwDetails').open = true; setTimeout(() => $('#pwInput').focus(), 60); }
    initGis(g.clientId);
  }

  /** Masuk dengan akun Google: server membaca akun yang sedang login (tanpa OAuth Client ID). */
  function ssoLogin() {
    loginBusy(true, 'Membuka verifikasi akun Google…');
    const back = location.origin + location.pathname;
    location.href = P.GAS_URL + '?action=sso&k=' + encodeURIComponent(A.key) + '&r=' + encodeURIComponent(back);
  }

  function exchangeSso(code) {
    showLogin();
    loginBusy(true, 'Memverifikasi akun & memuat dashboard…');
    P.api('ssoExchange', { k: A.key, code }, { timeout: 45000 }).then(handleLogin);
  }

  function passwordLogin(e) {
    e.preventDefault();
    const inp = $('#pwInput');
    if (!inp.value) { inp.focus(); return; }
    loginBusy(true, 'Memeriksa kata sandi…'); loginMsg('');
    P.api('loginPassword', { k: A.key, password: inp.value }, { timeout: 45000 }).then((res) => {
      if (res && res.success) inp.value = '';
      handleLogin(res);
      if (res && !res.success && /PASSWORD|LOCKED/.test(res.code || '')) { $('#pwDetails').open = true; inp.select(); }
    });
  }

  /** Tombol Google Identity Services (opsional, hanya jika OAUTH_CLIENT_ID diisi). */
  function initGis(clientId) {
    const wrap = $('#gisWrap');
    if (!clientId) { wrap.hidden = true; return; }
    loadOnce(CDN.gis).then(() => {
      const g = window.google && window.google.accounts && window.google.accounts.id;
      if (!g) throw new Error('GIS');
      if (A.gisInit !== clientId) {
        g.initialize({ client_id: clientId, callback: onCredential, ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true, itp_support: true });
        A.gisInit = clientId;
      }
      $('#gisBtn').innerHTML = '';
      g.renderButton($('#gisBtn'), { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', logo_alignment: 'left', width: 300, locale: 'id' });
      wrap.hidden = false;
    }).catch(() => { wrap.hidden = true; });
  }

  function onCredential(resp) {
    if (!resp || !resp.credential) { loginMsg('Login dibatalkan.', 'warning'); return; }
    loginBusy(true); loginMsg('');
    P.api('loginGoogle', { k: A.key, credential: resp.credential }, { timeout: 45000 }).then(handleLogin);
  }

  function handleLogin(res) {
    loginBusy(false);
    if (res && res.success) {
      A.token = res.data.token; A.user = res.data.user;
      saveSess();
      boot(res.data.boot);
      A.lastFetch = Date.now();
      toast('Selamat datang, ' + firstName() + '!', 'success');
      return;
    }
    const code = res && res.code;
    if (code === 'DENIED') {
      $('#deniedMsg').textContent = res.message + (res.data && res.data.email ? ` (${res.data.email})` : '');
      screen('admDenied');
      return;
    }
    if (code === 'BAD_KEY') { LS.del(KKEY); LS.del(GKEY); noKey('Alamat admin tidak valid', res.message); return; }
    if ($('#admLogin').hidden) showLogin();
    loginMsg((res && res.message) || 'Login gagal.', 'error');
  }

  function clearSession() {
    A.token = ''; A.user = null; A.d = null;
    A.ui.set = null; A.ui.prof = null; A.ui.setDirty = false; A.ui.profDirty = false;
    LS.del(SKEY); LS.del(DKEY);
  }

  function authLost(msg) {
    clearSession();
    closeAllModals();
    showLogin(msg || 'Sesi berakhir. Silakan masuk lagi.', 'warning');
  }

  function firstName() {
    const n = (A.user && A.user.name) || (A.d && A.d.profil && plain(A.d.profil.nama_lengkap)) || 'Admin';
    return n.split(' ')[0];
  }

  function exitToSite() { location.href = siteUrl(); }


  // ════════════════════════════════════════════════════════
  // BAGIAN 3: BOOT, SHELL & NAVIGASI (0 ms antar menu)
  // ════════════════════════════════════════════════════════
  function normalize(d) {
    ['tentang', 'keahlian', 'portofolio', 'testimoni', 'kontak', 'pesan'].forEach((k) => { d[k] = Array.isArray(d[k]) ? d[k] : []; });
    ['keahlian', 'portofolio', 'testimoni', 'kontak'].forEach((k) => d[k].forEach((r) => { r.tampil = isOn(r.tampil); }));
    ['tentang', 'keahlian', 'portofolio', 'kontak'].forEach((k) => d[k].sort(byUrut));
    d.stats = d.stats || { agg: [], log: [] };
    d.settings = d.settings || {};
    d.profil = d.profil || {};
    d.meta = d.meta || {};
    return d;
  }

  function boot(d, silent) {
    const again = !!A.d && !$('#admApp').hidden;      // data baru saat dashboard sudah tampil (SWR)
    A.d = normalize(d);
    if (!A.ui.setDirty) A.ui.set = null;
    if (!A.ui.profDirty) A.ui.prof = null;
    persist();
    P.applyTheme(A.d.settings);
    if ($('#admApp').hidden) screen('admApp');
    renderShell();
    if (again) { RENDER[A.route](); } else navigate(A.route, true);   // tanpa lompat ke atas
    loadOnce(CDN.chart).then(() => { chartDefaults(); redrawCharts(); }).catch(() => { /* grafik opsional */ });
    if (!silent) renderSync();
  }

  function renderShell() {
    $('#sideNav').innerHTML = ROUTES.map(([r, t, i]) => `<button type="button" data-route="${r}"><i class="bi bi-${i}" aria-hidden="true"></i><span>${t}</span>${r === 'pesan' ? '<span class="badge" id="sideBadge" hidden></span>' : ''}</button>`).join('');
    const name = (A.user && A.user.name) || plain(A.d.profil.nama_lengkap) || (A.user && A.user.email) || 'Admin';
    const pic = (A.user && safeUrl(A.user.picture)) || safeUrl(A.d.profil.url_foto);
    const av = pic ? `<img src="${esc(pic)}" alt="" referrerpolicy="no-referrer">` : esc(initials(name));
    $('#meAvatar').innerHTML = av;
    $('#sideAvatar').innerHTML = av;
    $('#meName').textContent = name;
    $('#sideName').textContent = name;
    $('#btnViewSite').href = siteUrl();
    renderBadges();
  }

  const unread = () => A.d.pesan.filter((m) => m.status === 'baru').length;

  function renderBadges() {
    if (!A.d) return;
    const n = unread();
    [['#sideBadge', n], ['#bnavBadge', n]].forEach(([s, v]) => { const el = $(s); if (el) { el.textContent = v > 99 ? '99+' : v; el.hidden = !v; } });
    $('#bellDot').hidden = !n;
  }

  function navigate(r, force) {
    if (r === 'keluar') { closeSheet(); confirmLogout(); return; }
    if (!ROUTE[r]) r = 'beranda';
    if (!force && A.route !== r) warnUnsaved(A.route);
    A.route = r; LS.set(RKEY, r);
    $$('.a-sec').forEach((s) => { s.hidden = s.id !== 'a-' + r; });
    $$('#sideNav button').forEach((b) => {
      const on = b.getAttribute('data-route') === r;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $$('#bnav button').forEach((b) => {
      const on = b.getAttribute('data-route') === r || (b.getAttribute('data-sheet') === 'konten' && KONTEN.indexOf(r) > -1) || (b.getAttribute('data-sheet') === 'lainnya' && r === 'pengaturan');
      b.classList.toggle('active', on);
    });
    $('#crumbTitle').textContent = ROUTE[r].t;
    closeSheet();
    RENDER[r]();
    window.scrollTo(0, 0);
  }

  function warnUnsaved(from) {
    if (from === 'pengaturan' && A.ui.setDirty) toast('Perubahan pengaturan belum disimpan.', 'warning', { action: 'Kembali', onAction: () => navigate('pengaturan') });
    if (from === 'profil' && A.ui.profDirty) toast('Perubahan profil belum disimpan.', 'warning', { action: 'Kembali', onAction: () => navigate('profil') });
  }

  function rerender(route) { if (A.route === route && A.d) RENDER[route](); renderBadges(); }

  function head(eyebrow, titleHtml, sub, actions) {
    return `<div class="a-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h1>${titleHtml}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${actions ? `<div class="a-actions">${actions}</div>` : ''}</div>`;
  }

  // ════════════════════════════════════════════════════════
  // BAGIAN 4: STATISTIK — perhitungan lokal dari data agregat
  // ════════════════════════════════════════════════════════
  function presetRange(p) {
    const today = new Date();
    if (p === 'all') return { from: '0000-01-01', to: '9999-12-31', all: true };
    if (p === 'year') return { from: today.getFullYear() + '-01-01', to: dstr(today) };
    const n = parseInt(p, 10) || 30;
    return { from: dstr(addDays(today, -(n - 1))), to: dstr(today) };
  }
  function prevOf(r) {
    if (r.all) return null;
    const f = parseDay(r.from), t = parseDay(r.to);
    const len = Math.round((t - f) / 86400000) + 1;
    return { from: dstr(addDays(f, -len)), to: dstr(addDays(f, -1)) };
  }
  function aggIn(r, type) {
    if (!r) return [];
    return (A.d.stats.agg || []).filter((x) => x[0] >= r.from && x[0] <= r.to && (!type || x[1] === type));
  }
  const sumN = (rows) => rows.reduce((s, x) => s + (Number(x[4]) || 0), 0);
  function groupBy(rows, idx) {
    const m = {};
    rows.forEach((x) => { const k = plain(x[idx]) || '(tanpa nama)'; m[k] = (m[k] || 0) + (Number(x[4]) || 0); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }
  function series(r, type) {
    const today = dstr(new Date());
    let from = r.from, to = r.to > today ? today : r.to;
    if (r.all) {
      const days = (A.d.stats.agg || []).map((x) => x[0]).sort();
      from = days[0] || today;
    }
    const f = parseDay(from), t = parseDay(to);
    const n = Math.max(1, Math.round((t - f) / 86400000) + 1);
    const rows = aggIn({ from, to }, type);
    const m = {};
    if (n <= 92) {
      rows.forEach((x) => { m[x[0]] = (m[x[0]] || 0) + (Number(x[4]) || 0); });
      const labels = [], values = [], keys = [];
      for (let i = 0; i < n; i++) {
        const d = addDays(f, i); const k = dstr(d);
        keys.push(k); labels.push(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })); values.push(m[k] || 0);
      }
      return { labels, values, keys, unit: 'hari' };
    }
    rows.forEach((x) => { const k = x[0].slice(0, 7); m[k] = (m[k] || 0) + (Number(x[4]) || 0); });
    const labels = [], values = [], keys = [];
    const cur = new Date(f.getFullYear(), f.getMonth(), 1);
    while (cur <= t) {
      const k = cur.getFullYear() + '-' + pad(cur.getMonth() + 1);
      keys.push(k); labels.push(cur.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })); values.push(m[k] || 0);
      cur.setMonth(cur.getMonth() + 1);
    }
    return { labels, values, keys, unit: 'bulan' };
  }
  function trendHtml(cur, prev) {
    if (prev === null || prev === undefined) return '';
    if (!prev && !cur) return '<span class="trend flat">0%</span>';
    if (!prev || (prev < 5 && cur > prev)) return '<span class="trend"><i class="bi bi-arrow-up-short"></i>baru</span>';
    const p = Math.round(((cur - prev) / prev) * 100);
    if (p === 0) return '<span class="trend flat">0%</span>';
    const txt = p > 999 ? '>999%' : (p > 0 ? '+' : '') + p + '%';
    return `<span class="trend${p < 0 ? ' down' : ''}"><i class="bi bi-arrow-${p < 0 ? 'down' : 'up'}-short" aria-hidden="true"></i>${txt}</span>`;
  }
  function msgsIn(r) {
    return A.d.pesan.filter((m) => { const d = new Date(m.timestamp); if (isNaN(d)) return false; const k = dstr(d); return k >= r.from && k <= r.to; });
  }
  function rangeLabel(r) {
    if (r.all) return 'Semua data';
    const o = { day: 'numeric', month: 'short', year: 'numeric' };
    return parseDay(r.from).toLocaleDateString('id-ID', o) + ' – ' + parseDay(r.to).toLocaleDateString('id-ID', o);
  }

  // ── Grafik (Chart.js, dimuat lazy) ──
  function chartDefaults() {
    const C = window.Chart; if (!C || C._pfDone) return;
    C._pfDone = true;
    C.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
    C.defaults.font.size = 12;
    C.defaults.color = '#5B6472';
    C.defaults.maintainAspectRatio = false;
    C.defaults.plugins.legend.display = false;
    Object.assign(C.defaults.plugins.tooltip, { backgroundColor: '#0B1F3A', padding: 10, cornerRadius: 10, displayColors: false, titleFont: { weight: '700' }, bodyFont: { weight: '600' } });
  }
  const cssVar = (n, d) => (getComputedStyle(document.documentElement).getPropertyValue(n) || '').trim() || d;

  function drawChart(id, cfgFn) {
    A.chartFns[id] = cfgFn;
    if (!window.Chart) return;
    const el = document.getElementById(id);
    if (!el) return;
    if (A.charts[id]) { A.charts[id].destroy(); delete A.charts[id]; }
    A.charts[id] = new window.Chart(el, cfgFn());
  }
  function redrawCharts() {
    Object.keys(A.chartFns).forEach((id) => { const el = document.getElementById(id); if (el && el.offsetParent !== null) drawChart(id, A.chartFns[id]); });
  }
  function destroyCharts() { Object.keys(A.charts).forEach((id) => { try { A.charts[id].destroy(); } catch (e) { /* abaikan */ } }); A.charts = {}; A.chartFns = {}; }

  function lineCfg(s, label) {
    const primary = cssVar('--primary', '#2563EB');
    const rgb = cssVar('--primary-rgb', '37, 99, 235');
    return {
      type: 'line',
      data: { labels: s.labels, datasets: [{
        label, data: s.values, borderColor: primary, borderWidth: 2, tension: 0.35, fill: true,
        backgroundColor: (ctx) => {
          const { chart } = ctx; const a = chart.chartArea;
          if (!a) return `rgba(${rgb}, .12)`;
          const g = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
          g.addColorStop(0, `rgba(${rgb}, .26)`); g.addColorStop(1, `rgba(${rgb}, 0)`);
          return g;
        },
        pointRadius: s.values.length > 16 ? 0 : 3, pointHoverRadius: 6, pointBackgroundColor: '#fff', pointBorderColor: primary, pointBorderWidth: 2, pointHitRadius: 12
      }] },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, border: { color: '#E2E8F0' }, ticks: { maxTicksLimit: 7, maxRotation: 0, autoSkip: true } },
          y: { beginAtZero: true, grid: { color: '#EEF2F7' }, border: { display: false }, ticks: { precision: 0, maxTicksLimit: 5 } }
        },
        plugins: { tooltip: { callbacks: { label: (c) => `${fmt(c.parsed.y)} ${label.toLowerCase()}` } } }
      }
    };
  }
  function barCfg(labels, values, label) {
    return {
      type: 'bar',
      data: { labels, datasets: [{ label, data: values, backgroundColor: cssVar('--primary', '#2563EB'), borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 46 }] },
      options: {
        scales: {
          x: { grid: { display: false }, border: { color: '#E2E8F0' }, ticks: { maxRotation: 0, autoSkip: true, callback(v) { const l = this.getLabelForValue(v); return l.length > 14 ? l.slice(0, 13) + '…' : l; } } },
          y: { beginAtZero: true, grid: { color: '#EEF2F7' }, border: { display: false }, ticks: { precision: 0, maxTicksLimit: 5 } }
        },
        plugins: { tooltip: { callbacks: { label: (c) => `${fmt(c.parsed.y)} klik` } } }
      }
    };
  }
  function donutCfg(entries) {
    return {
      type: 'doughnut',
      data: { labels: entries.map((e) => DEV_LABEL[e[0]] || e[0]), datasets: [{ data: entries.map((e) => e[1]), backgroundColor: entries.map((e) => DEV_COLOR[e[0]] || '#94A3B8'), borderColor: '#fff', borderWidth: 2, hoverOffset: 4 }] },
      options: { cutout: '72%', plugins: { tooltip: { callbacks: { label: (c) => `${c.label}: ${fmt(c.parsed)} sesi` } } } }
    };
  }
  function hbarHtml(entries, limit) {
    if (!entries.length) return '<div class="empty-st" style="padding:28px"><i class="bi bi-cursor"></i>Belum ada klik pada periode ini.</div>';
    const max = entries[0][1] || 1;
    const total = entries.reduce((s, e) => s + e[1], 0) || 1;
    return `<div class="hbar">${entries.slice(0, limit || 6).map(([k, v]) => `
      <div class="hbar-row"><div class="hbar-top"><span title="${esc(k)}">${esc(k)}</span><span><b>${fmt(v)}</b><small>klik (${Math.round((v / total) * 100)}%)</small></span></div>
      <div class="hbar-track" role="img" aria-label="${esc(k)}: ${fmt(v)} klik"><span style="width:${Math.max(3, (v / max) * 100)}%"></span></div></div>`).join('')}</div>`;
  }
  function deviceHtml(entries, idc) {
    const total = entries.reduce((s, e) => s + e[1], 0);
    if (!total) return '<div class="empty-st" style="padding:28px"><i class="bi bi-phone"></i>Belum ada kunjungan pada periode ini.</div>';
    return `<div class="donut-wrap"><div class="donut"><canvas id="${idc}" aria-label="Proporsi perangkat"></canvas><div class="donut-center"><div><b>${fmt(total)}</b><small>Total sesi</small></div></div></div>
      <div class="legend">${entries.map(([k, v]) => `<div><i class="sw" style="background:${DEV_COLOR[k] || '#94A3B8'}"></i>${DEV_LABEL[k] || esc(k)}<b>${fmt(v)}</b><small>${Math.round((v / total) * 100)}%</small></div>`).join('')}</div></div>`;
  }

  // ════════════════════════════════════════════════════════
  // BAGIAN 5: A1 BERANDA
  // ════════════════════════════════════════════════════════
  function renderBeranda() {
    const sec = $('#a-beranda');
    const n = A.ui.home;
    const r = presetRange(String(n)); const pr = prevOf(r);
    const vis = sumN(aggIn(r, 'kunjungan')), visP = sumN(aggIn(pr, 'kunjungan'));
    const kp = sumN(aggIn(r, 'klik_proyek')), kpP = sumN(aggIn(pr, 'klik_proyek'));
    const kk = sumN(aggIn(r, 'klik_kontak')) + sumN(aggIn(r, 'klik_cta'));
    const kkP = sumN(aggIn(pr, 'klik_kontak')) + sumN(aggIn(pr, 'klik_cta'));
    const nb = unread();
    const proj = groupBy(aggIn(r, 'klik_proyek'), 2);
    const latest = A.d.pesan.slice(0, 5);
    const vt = visP >= 5 ? Math.round(((vis - visP) / visP) * 100) : null;
    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const s = A.d.settings;
    const shown = (k) => A.d[k].filter((x) => isOn(x.tampil)).length;
    const site = siteUrl();
    sec.innerHTML = `
      <div class="panel welcome">
        <div>
          <span class="eyebrow">Ringkasan · ${esc(today)}</span>
          <h2 style="margin-top:8px">Selamat datang kembali, <span class="accent">${esc(firstName())}</span></h2>
          <p>Kunjungan ${n} hari terakhir ${vt === null ? 'mulai tercatat' : vt >= 0 ? `naik <b>${vt}%</b> dibanding periode sebelumnya` : `turun <b>${-vt}%</b> dibanding periode sebelumnya`}. ${nb ? `Ada <b>${nb} pesan baru</b> yang menunggu balasan.` : 'Semua pesan sudah dibaca.'}</p>
        </div>
        <div class="a-actions">
          ${site ? `<a class="btn btn-ghost" href="${esc(site)}" target="_blank" rel="noopener"><i class="bi bi-eye" aria-hidden="true"></i>Pratinjau Situs</a>` : ''}
          <button type="button" class="btn btn-primary" data-act="new-proj"><i class="bi bi-plus-lg" aria-hidden="true"></i>Tambah Proyek</button>
        </div>
      </div>
      <div class="grid g-kpi mt">
        ${kpiCard('Total Kunjungan', vis, 'globe2', trendHtml(vis, visP), `${n} hari terakhir`)}
        ${kpiCard('Klik Proyek', kp, 'cursor', trendHtml(kp, kpP), vis ? `${Math.round((kp / vis) * 100)}% dari kunjungan` : 'dari kunjungan')}
        ${kpiCard('Klik Kontak & CTA', kk, 'send', trendHtml(kk, kkP), 'minat kerja sama')}
        ${kpiCard('Pesan Baru', nb, 'envelope', nb ? '<span class="st st-baru">Perlu respons</span>' : '<span class="st st-on">Semua terbaca</span>', '', true)}
      </div>
      <div class="panel mt">
        <div class="panel-head">
          <div><span class="eyebrow">Aktivitas lalu lintas</span><h2>Kunjungan ${n} Hari Terakhir</h2><p>Jumlah kunjungan unik per sesi peramban.</p></div>
          <div class="seg" role="group" aria-label="Rentang grafik">${[7, 30, 90].map((x) => `<button type="button" data-home-range="${x}" aria-pressed="${x === n}">${x} Hari</button>`).join('')}</div>
        </div>
        <div class="chart-box"><canvas id="chHome" role="img" aria-label="Grafik garis kunjungan harian"></canvas>${vis ? '' : '<div class="chart-empty">Belum ada kunjungan pada rentang ini.</div>'}</div>
      </div>
      <div class="grid g-2 g-2-wide mt">
        <div class="panel">
          <div class="panel-head"><div><h2><i class="bi bi-inbox" style="color:var(--primary)"></i> Pesan Masuk Terbaru</h2><p>${fmt(A.d.pesan.length)} pesan tersimpan</p></div><button type="button" class="link" data-route="pesan">Lihat semua <i class="bi bi-arrow-right"></i></button></div>
          ${latest.length ? `<div class="rows">${latest.map((m) => `
            <div class="row" style="cursor:pointer" data-open-msg="${esc(m.id)}">
              <span class="row-vis round" style="background:${m.status === 'baru' ? 'var(--navy)' : 'var(--sky)'};color:${m.status === 'baru' ? '#fff' : 'var(--primary-600)'}">${esc(initials(m.nama))}</span>
              <div class="row-main"><b>${esc(m.nama)}</b><small>${esc(plain(m.pesan).slice(0, 90))}</small></div>
              <div class="row-acts" style="flex-direction:column;align-items:flex-end;gap:4px"><small class="muted" style="font-size:12px">${esc(timeLabel(m.timestamp))}</small><span class="st st-${m.status === 'baru' ? 'baru' : 'dibaca'}">${m.status === 'baru' ? 'Baru' : 'Dibaca'}</span></div>
            </div>`).join('')}</div>` : '<div class="empty-st"><i class="bi bi-inbox"></i><b>Belum ada pesan</b>Pesan dari formulir kontak akan muncul di sini.</div>'}
        </div>
        <div class="panel">
          <div class="panel-head"><div><h2><i class="bi bi-bar-chart" style="color:var(--primary)"></i> Klik per Proyek</h2><p>Proyek yang paling banyak dibuka pengunjung</p></div><span class="chip">Top 5</span></div>
          ${hbarHtml(proj, 5)}
          <div class="total-box"><div><small>Total evaluasi klik</small><b class="tnum">${fmt(kp)} interaksi</b></div><span class="ic"><i class="bi bi-hand-index"></i></span></div>
        </div>
      </div>
      <div class="grid g-2 mt" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
        <div class="panel"><span class="eyebrow">Status situs</span><h2 style="font-size:20px;margin:6px 0">${s.situs_aktif ? 'Aktif & terbit' : 'Mode perawatan'}</h2><p class="muted" style="font-size:13.5px">${s.situs_aktif ? 'Pengunjung dapat membuka landing page.' : 'Pengunjung melihat halaman perawatan.'}</p><button type="button" class="link" data-route="pengaturan" style="margin-top:8px">Ubah di Pengaturan <i class="bi bi-arrow-right"></i></button></div>
        <div class="panel"><span class="eyebrow">Konten tampil</span><h2 style="font-size:20px;margin:6px 0">${shown('portofolio')} proyek · ${shown('keahlian')} keahlian</h2><p class="muted" style="font-size:13.5px">${shown('testimoni')} testimoni dan ${shown('kontak')} tautan sosial aktif.</p><button type="button" class="link" data-route="portofolio" style="margin-top:8px">Kelola portofolio <i class="bi bi-arrow-right"></i></button></div>
        <div class="panel"><span class="eyebrow">Database</span><h2 style="font-size:20px;margin:6px 0">Google Sheets</h2><p class="muted" style="font-size:13.5px">Semua konten tersimpan di spreadsheet milik Anda.</p>${A.d.meta.spreadsheetUrl ? `<a class="link" href="${esc(A.d.meta.spreadsheetUrl)}" target="_blank" rel="noopener" style="margin-top:8px">Buka spreadsheet <i class="bi bi-box-arrow-up-right"></i></a>` : ''}</div>
      </div>`;
    drawChart('chHome', () => lineCfg(series(r, 'kunjungan'), 'Kunjungan'));
  }

  function kpiCard(label, val, ic, trend, foot, yellow) {
    return `<div class="panel kpi"><div class="kpi-top"><span class="kpi-label">${esc(label)}</span><span class="ic${yellow ? ' y' : ''}"><i class="bi bi-${ic}" aria-hidden="true"></i></span></div>
      <div class="kpi-num">${fmt(val)}</div><div class="kpi-foot">${trend || ''}${foot ? `<span>${esc(foot)}</span>` : ''}</div></div>`;
  }

  // ════════════════════════════════════════════════════════
  // BAGIAN 6: UNGGAH GAMBAR (kompres di browser → Drive)
  // ════════════════════════════════════════════════════════
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) return reject(new Error('Format harus JPG, PNG, WEBP, atau GIF.'));
      if (file.size > 25 * 1024 * 1024) return reject(new Error('Berkas terlalu besar (maksimal 25 MB sebelum dikompres).'));
      if (/gif/i.test(file.type)) {
        if (file.size > MAX_IMG) return reject(new Error('GIF tidak dapat dikompres; maksimal 2 MB.'));
        const fr = new FileReader();
        fr.onload = () => resolve({ b64: String(fr.result).split(',')[1], mime: 'image/gif', dataUrl: fr.result });
        fr.onerror = () => reject(new Error('Gambar tidak dapat dibaca.'));
        return fr.readAsDataURL(file);
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const s0 = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        let w = Math.round(img.naturalWidth * s0), h = Math.round(img.naturalHeight * s0);
        let q = 0.86, mime = 'image/webp', tries = 0;
        const cv = document.createElement('canvas');
        const enc = () => {
          tries++;
          cv.width = w; cv.height = h;
          const cx = cv.getContext('2d');
          if (mime === 'image/jpeg') { cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); }
          cx.drawImage(img, 0, 0, w, h);
          const du = cv.toDataURL(mime, q);
          if (mime === 'image/webp' && du.indexOf('data:image/webp') !== 0) { mime = 'image/jpeg'; return enc(); }
          const bytes = Math.ceil((du.length - du.indexOf(',') - 1) * 0.75);
          if (bytes > MAX_IMG * 0.95 && tries < 12) { if (q > 0.6) q -= 0.1; else { w = Math.round(w * 0.82); h = Math.round(h * 0.82); } return enc(); }
          if (bytes > MAX_IMG) return reject(new Error('Gambar masih di atas 2 MB setelah dikompres.'));
          resolve({ b64: du.split(',')[1], mime, dataUrl: du });
        };
        enc();
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gambar tidak dapat dibaca.')); };
      img.src = url;
    });
  }

  function uploaderHtml(id, url, kind, name) {
    const u = safeUrl(url);
    return `<div class="uploader" data-up="${id}" data-kind="${kind}">
      <div class="up-prev">${u ? `<img src="${esc(u)}" alt="Pratinjau gambar" referrerpolicy="no-referrer">` : '<i class="bi bi-image" aria-hidden="true"></i>'}</div>
      <div class="up-acts">
        <div class="btns"><label class="btn btn-ghost" tabindex="0"><i class="bi bi-upload" aria-hidden="true"></i>Pilih Gambar<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden data-file="${id}"></label>
        <button type="button" class="btn btn-ghost" data-clear-img="${id}"${u ? '' : ' hidden'}><i class="bi bi-trash3" aria-hidden="true"></i>Hapus</button></div>
        <input class="input" type="url" placeholder="atau tempel URL gambar https:\/\/…" value="${esc(u)}" data-urlin="${id}"${name ? ` name="${name}"` : ''} aria-label="URL gambar">
        <small class="hint up-status">Seret & lepas gambar ke kotak ini. Dikompres otomatis ≤ 2 MB.</small>
      </div></div>`;
  }

  function upState(id, state, msg) {
    const box = $(`[data-up="${id}"]`); if (!box) return;
    const prev = $('.up-prev', box);
    const old = $('.busy', prev); if (old) old.remove();
    if (state === 'busy') prev.insertAdjacentHTML('beforeend', '<div class="busy"><span class="spin-dark"></span></div>');
    const st = $('.up-status', box);
    st.textContent = state === 'busy' ? 'Mengompres & mengunggah…' : state === 'done' ? 'Gambar terunggah ke Google Drive.' : state === 'fail' ? ('Gagal: ' + (msg || '')) : st.textContent;
    st.style.color = state === 'fail' ? 'var(--danger)' : state === 'done' ? 'var(--success)' : '';
  }
  function upPreview(id, src) {
    const box = $(`[data-up="${id}"]`); if (!box) return;
    const prev = $('.up-prev', box);
    prev.innerHTML = src ? `<img src="${esc(src)}" alt="Pratinjau gambar" referrerpolicy="no-referrer">` : '<i class="bi bi-image" aria-hidden="true"></i>';
    const clr = $('[data-clear-img]', box); if (clr) clr.hidden = !src;
  }

  /** Mulai unggah segera saat file dipilih (latar belakang). Pratinjau tampil instan. */
  function startUpload(id, file) {
    const box = $(`[data-up="${id}"]`);
    const kind = box ? box.getAttribute('data-kind') : 'foto';
    upPreview(id, URL.createObjectURL(file));
    upState(id, 'busy');
    const pr = compressImage(file)
      .then((c) => call('adminUploadImage', c.b64, c.mime, file.name, kind))
      .then((res) => {
        if (!res || !res.success) throw new Error((res && res.message) || 'Unggah gagal.');
        if (res.data.warning) toast(res.data.warning, 'warning');
        const inp = $(`[data-urlin="${id}"]`); if (inp) inp.value = res.data.url;
        upState(id, 'done');
        onImageChange(id, res.data.url);
        return res.data.url;
      })
      .catch((err) => { upState(id, 'fail', err.message); if (!err.auth) toast('Gagal mengunggah gambar: ' + err.message, 'error'); throw err; });
    A.uploads[id] = pr;
    pr.catch(() => {}).then(() => { if (A.uploads[id] === pr) delete A.uploads[id]; });
    return pr;
  }

  function onImageChange(id, url) {
    if (id === 'prof_foto' && A.ui.prof) { A.ui.prof.url_foto = url; markProfDirty(); }
  }

  // ════════════════════════════════════════════════════════
  // BAGIAN 7: A2 PROFIL
  // ════════════════════════════════════════════════════════
  const PROF_FIELDS = [
    { k: 'nama_lengkap', l: 'Nama lengkap', req: 1, max: 100 },
    { k: 'profesi', l: 'Profesi / label hero', max: 120, ph: 'Lead Product Architect' },
    { k: 'headline', l: 'Headline', req: 1, max: 160, full: 1, hint: 'Apit satu kata dengan tanda bintang untuk aksen tulisan tangan, contoh: Produk yang *Menyenangkan*' },
    { k: 'deskripsi_singkat', l: 'Deskripsi singkat', t: 'textarea', max: 500, full: 1 },
    { k: 'teks_tombol_1', l: 'Teks tombol utama', max: 40, ph: 'Lihat Portofolio' },
    { k: 'teks_tombol_2', l: 'Teks tombol kedua', max: 40, ph: 'Tentang Saya' },
    { k: 'tahun_pengalaman', l: 'Tahun pengalaman', t: 'number', max: 2 },
    { k: 'url_video_intro', l: 'URL video perkenalan (opsional)', t: 'url', max: 500, ph: 'https:\/\/youtu.be/…', hint: 'YouTube, Vimeo, atau Google Drive.' }
  ];

  function renderProfil() {
    if (!A.ui.prof) A.ui.prof = Object.assign({}, A.d.profil);
    const p = A.ui.prof;
    $('#a-profil').innerHTML = head('Konten hero', 'Profil', 'Nama, headline, dan foto yang tampil di bagian paling atas landing page.') + `
      <div class="grid g-2 g-2-wide" style="align-items:start">
        <div class="panel"><div class="panel-head"><div><h2>Identitas & Hero</h2><p>Teks utama yang pertama kali dibaca pengunjung.</p></div></div>
          <div class="fgrid">${PROF_FIELDS.map((f) => fieldHtml(f, p[f.k], 'prof')).join('')}</div>
          <div class="field full"><label>Pratinjau headline</label><div class="preview-line" id="headPrev">${P.accent(p.headline || '', false)}</div></div>
        </div>
        <div class="panel"><div class="panel-head"><div><h2>Foto Profil</h2><p>Tampil di hero, navbar, dan kartu About.</p></div></div>
          ${uploaderHtml('prof_foto', p.url_foto, 'foto')}
          <ul class="check-list" style="margin-top:18px">
            <li><i class="bi bi-check-circle"></i><span>Gunakan foto potret (rasio 4:5) dengan latar sederhana.</span></li>
            <li><i class="bi bi-check-circle"></i><span>Gambar besar dikompres otomatis di browser sebelum diunggah.</span></li>
            <li><i class="bi bi-check-circle"></i><span>Berkas disimpan di folder Drive <b>Foto-Profil</b>.</span></li>
          </ul>
        </div>
      </div>
      <div id="profBar"></div>`;
    renderProfBar();
  }
  function markProfDirty() { A.ui.profDirty = true; renderProfBar(); }
  function renderProfBar() {
    const el = $('#profBar'); if (!el) return;
    el.innerHTML = A.ui.profDirty ? `<div class="save-bar"><span><i class="bi bi-pencil-square"></i>Ada perubahan profil yang belum disimpan</span><div class="a-actions"><button type="button" class="btn btn-ghost" data-act="cancel-prof">Batal</button><button type="button" class="btn btn-primary" data-act="save-prof"><i class="bi bi-check2"></i>Simpan Profil</button></div></div>` : '';
  }
  function saveProfil() {
    const p = Object.assign({}, A.ui.prof);
    const errs = {};
    PROF_FIELDS.forEach((f) => {
      const v = String(p[f.k] === undefined ? '' : p[f.k]).trim();
      if (f.req && !v) errs[f.k] = f.l + ' wajib diisi.';
      else if (f.t === 'url' && v && !isHttps(v)) errs[f.k] = 'Harus diawali https:\/\/';
      else if (MARKUP.test(v)) errs[f.k] = 'Tidak boleh berisi kode HTML.';
    });
    if (p.url_foto && !isHttps(p.url_foto) && !A.uploads.prof_foto) errs.url_foto = 'URL foto harus diawali https:\/\/';
    $$('#a-profil .field').forEach((f) => showErr(f, errs[f.getAttribute('data-f')]));
    if (errs.url_foto) toast(errs.url_foto, 'error');
    const first = Object.keys(errs)[0];
    if (first) { const el = $(`#a-profil [data-f="${first}"] .input`); if (el) el.focus(); return; }
    p.tahun_pengalaman = parseInt(p.tahun_pengalaman, 10) || 0;
    const old = Object.assign({}, A.d.profil);
    const go = (url) => {
      if (url) p.url_foto = url;
      A.d.profil = Object.assign({}, p);
      A.ui.prof = Object.assign({}, p); A.ui.profDirty = false;
      renderProfBar(); renderShell(); persist();
      sync('adminSaveProfil', [p], () => { A.d.profil = old; A.ui.prof = Object.assign({}, p); A.ui.profDirty = true; rerender('profil'); });
    };
    toast('Profil disimpan.', 'success');
    const pend = A.uploads.prof_foto;
    A.ui.profDirty = false; renderProfBar();
    if (pend) pend.then(go, () => go()); else go();
  }

  // ════════════════════════════════════════════════════════
  // BAGIAN 8: A3–A7 CRUD GENERIK (optimistic)
  // ════════════════════════════════════════════════════════
  const JENIS = [['pendidikan', 'Pendidikan', 'mortarboard'], ['pengalaman', 'Pengalaman', 'briefcase'], ['minat', 'Minat', 'lightbulb'], ['tujuan_karier', 'Tujuan Karier', 'flag']];
  const JENIS_ICON = {}; JENIS.forEach(([k, , i]) => { JENIS_ICON[k] = i; });
  const ICONS_SKILL = ['palette', 'code-slash', 'diagram-3', 'search-heart', 'arrow-repeat', 'diagram-2', 'people', 'lightning-charge', 'brush', 'phone', 'laptop', 'database', 'graph-up', 'camera', 'pen', 'translate', 'kanban', 'cpu', 'cloud', 'shield-check', 'megaphone', 'easel', 'puzzle', 'stars'];
  const ICONS_SOC = ['linkedin', 'github', 'dribbble', 'behance', 'instagram', 'twitter-x', 'youtube', 'tiktok', 'facebook', 'medium', 'whatsapp', 'telegram', 'envelope', 'globe2', 'link-45deg', 'spotify'];
  const klikProyek = (judul) => sumN((A.d.stats.agg || []).filter((x) => x[1] === 'klik_proyek' && plain(x[2]) === plain(judul)));

  const CRUD = {
    tentang: {
      sheet: 'Tentang', key: 'tentang', single: 'Riwayat', eyebrow: 'Konten About', title: 'Tentang <span class="accent">riwayat</span>',
      sub: 'Pendidikan, pengalaman, minat, dan tujuan karier yang tampil di bagian About.', order: true, tabs: JENIS,
      fields: [
        { k: 'jenis', l: 'Jenis', t: 'select', opts: JENIS.map(([a, b]) => [a, b]), req: 1 },
        { k: 'judul', l: 'Judul', req: 1, max: 150, ph: 'Contoh: Head of Design Systems' },
        { k: 'instansi', l: 'Instansi', max: 150, ph: 'Nama kampus / perusahaan' },
        { k: 'periode', l: 'Periode', max: 60, ph: '2019 – 2022' },
        { k: 'deskripsi', l: 'Deskripsi', t: 'textarea', max: 600, full: 1 }
      ],
      vis: (r) => `<span class="row-vis"><i class="bi bi-${JENIS_ICON[r.jenis] || 'dot'}" aria-hidden="true"></i></span>`,
      rowTitle: (r) => r.judul, rowSub: (r) => [r.instansi, r.periode].filter(Boolean).join(' • ') || r.deskripsi,
      blank: (st) => ({ jenis: st.tab || 'pendidikan' })
    },
    keahlian: {
      sheet: 'Keahlian', key: 'keahlian', single: 'Keahlian', eyebrow: 'Konten Skills', title: 'Keahlian <span class="accent">saya</span>',
      sub: 'Kartu keahlian beserta kategori dan tingkat kemahiran.', order: true, toggle: true, filterBy: 'kategori',
      fields: [
        { k: 'nama_skill', l: 'Nama skill', req: 1, max: 80, ph: 'Contoh: Figma & Tokens' },
        { k: 'kategori', l: 'Kategori', req: 1, max: 40, list: 1, ph: 'Teknis / Desain / Soft Skill' },
        { k: 'level', l: 'Tingkat kemahiran', t: 'range', full: 1 },
        { k: 'deskripsi', l: 'Deskripsi singkat', max: 160, full: 1, ph: 'Variables, Auto Layout, sinkron GitHub' },
        { k: 'ikon', l: 'Ikon', t: 'icon', opts: ICONS_SKILL, full: 1 },
        { k: 'tampil', l: 'Tampilkan di situs', t: 'switch', full: 1 }
      ],
      vis: (r) => `<span class="row-vis"><i class="bi bi-${icon(r.ikon)}" aria-hidden="true"></i></span>`,
      rowTitle: (r) => r.nama_skill, rowSub: (r) => [r.kategori, r.deskripsi].filter(Boolean).join(' • '),
      extra: (r) => `<span class="mini-bar"><span style="width:${Math.max(0, Math.min(100, +r.level || 0))}%"></span></span><b class="tnum" style="width:42px;text-align:right">${+r.level || 0}%</b>`,
      blank: () => ({ level: 80, ikon: 'stars', tampil: true })
    },
    portofolio: {
      sheet: 'Portofolio', key: 'portofolio', single: 'Proyek', eyebrow: 'Konten Portfolio', title: 'Portofolio <span class="accent">proyek</span>',
      sub: 'Proyek yang tampil di grid portofolio. Klik pada tombol panah dicatat di Statistik.', order: true, toggle: true, filterBy: 'kategori',
      fields: [
        { k: 'judul', l: 'Judul proyek', req: 1, max: 120 },
        { k: 'kategori', l: 'Kategori', req: 1, max: 40, list: 1, ph: 'Web App / Fintech / Desain Sistem' },
        { k: 'periode', l: 'Periode selesai', max: 40, ph: 'Q1 2025' },
        { k: 'url_tautan', l: 'URL tautan proyek', t: 'url', max: 500, ph: 'https:\/\/…' },
        { k: 'deskripsi_singkat', l: 'Deskripsi singkat', t: 'textarea', max: 300, full: 1 },
        { k: 'teknologi', l: 'Teknologi', max: 200, full: 1, ph: 'React, Tailwind, Storybook', hint: 'Pisahkan dengan koma. Maksimal 4 yang tampil.' },
        { k: 'url_gambar', l: 'Gambar sampul', t: 'image', kind: 'proyek', full: 1 },
        { k: 'tampil', l: 'Tampilkan di situs', t: 'switch', full: 1 }
      ],
      vis: (r) => `<span class="row-vis">${safeUrl(r.url_gambar) ? `<img src="${esc(r.url_gambar)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<i class="bi bi-window-stack" aria-hidden="true"></i>'}</span>`,
      rowTitle: (r) => r.judul, rowSub: (r) => [r.kategori, r.periode].filter(Boolean).join(' • '),
      extra: (r) => `<span class="chip chip-sky">${fmt(klikProyek(r.judul))} klik</span>`,
      blank: () => ({ tampil: true })
    },
    testimoni: {
      sheet: 'Testimoni', key: 'testimoni', single: 'Testimoni', eyebrow: 'Konten opsional', title: 'Testimoni <span class="accent">klien</span>',
      sub: 'Bagian Testimoni hanya tampil di situs jika ada minimal satu testimoni aktif.', order: false, toggle: true,
      fields: [
        { k: 'nama', l: 'Nama', req: 1, max: 100 },
        { k: 'jabatan_instansi', l: 'Jabatan & instansi', max: 150, ph: 'CTO, PT Contoh' },
        { k: 'isi', l: 'Isi testimoni', t: 'textarea', req: 1, max: 600, full: 1 },
        { k: 'rating', l: 'Rating', t: 'stars', full: 1 },
        { k: 'url_foto', l: 'Foto (opsional)', t: 'image', kind: 'foto', full: 1 },
        { k: 'tampil', l: 'Tampilkan di situs', t: 'switch', full: 1 }
      ],
      vis: (r) => `<span class="row-vis round">${safeUrl(r.url_foto) ? `<img src="${esc(r.url_foto)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc(initials(r.nama))}</span>`,
      rowTitle: (r) => r.nama, rowSub: (r) => r.jabatan_instansi || plain(r.isi).slice(0, 80),
      extra: (r) => `<span style="color:var(--yellow-600);letter-spacing:1px">${'★'.repeat(Math.max(1, Math.min(5, +r.rating || 5)))}</span>`,
      blank: () => ({ rating: 5, tampil: true })
    },
    kontak: {
      sheet: 'Kontak', key: 'kontak', single: 'Tautan', eyebrow: 'Kontak & sosial', title: 'Kontak & <span class="accent">sosial</span>',
      sub: 'Tautan media sosial yang tampil di info bar, kartu kontak, dan footer. URL wajib diawali https:\/\/.', order: true, toggle: true,
      fields: [
        { k: 'label', l: 'Label', req: 1, max: 40, ph: 'LinkedIn' },
        { k: 'url', l: 'URL', t: 'url', req: 1, max: 500, ph: 'https:\/\/www.linkedin.com/in/…' },
        { k: 'ikon', l: 'Ikon', t: 'icon', opts: ICONS_SOC, full: 1 },
        { k: 'tampil', l: 'Tampilkan di situs', t: 'switch', full: 1 }
      ],
      vis: (r) => `<span class="row-vis"><i class="bi bi-${icon(r.ikon)}" aria-hidden="true"></i></span>`,
      rowTitle: (r) => r.label, rowSub: (r) => r.url,
      blank: () => ({ ikon: 'link-45deg', tampil: true })
    }
  };

  function crudState(route) {
    const c = CRUD[route];
    return A.ui.crud[route] || (A.ui.crud[route] = { q: '', tab: c.tabs ? c.tabs[0][0] : null, cat: 'semua' });
  }

  function renderCrud(route) {
    const c = CRUD[route]; const st = crudState(route);
    const all = A.d[c.key];
    const cats = c.filterBy ? Array.from(new Set(all.map((r) => plain(r[c.filterBy])).filter(Boolean))) : [];
    if (st.cat !== 'semua' && cats.indexOf(st.cat) === -1) st.cat = 'semua';
    $('#a-' + route).innerHTML = head(c.eyebrow, c.title, c.sub, `<button type="button" class="btn btn-primary" data-add="${route}"><i class="bi bi-plus-lg" aria-hidden="true"></i>Tambah ${esc(c.single)}</button>`) + `
      ${c.tabs ? `<div class="tabs" role="tablist">${c.tabs.map(([k, l, i]) => `<button type="button" role="tab" data-tab="${route}:${k}" aria-selected="${st.tab === k}"><i class="bi bi-${i}" aria-hidden="true"></i>${l}<span class="n">${all.filter((r) => r.jenis === k).length}</span></button>`).join('')}</div>` : ''}
      <div class="toolbar">
        <label class="search"><i class="bi bi-search" aria-hidden="true"></i><input class="input" type="search" placeholder="Cari ${esc(c.single.toLowerCase())}…" value="${esc(st.q)}" data-crud-q="${route}" aria-label="Cari"></label>
        ${cats.length > 1 ? `<select class="select" data-crud-cat="${route}" aria-label="Filter kategori"><option value="semua">Semua kategori</option>${cats.map((x) => `<option ${x === st.cat ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : ''}
      </div>
      <div id="rows-${route}"></div>`;
    renderCrudRows(route);
  }

  function crudVisible(route) {
    const c = CRUD[route]; const st = crudState(route);
    let list = A.d[c.key].slice();
    if (c.order) list.sort(byUrut);
    if (c.tabs) list = list.filter((r) => r.jenis === st.tab);
    if (c.filterBy && st.cat !== 'semua') list = list.filter((r) => plain(r[c.filterBy]) === st.cat);
    if (st.q) { const q = st.q.toLowerCase(); list = list.filter((r) => c.fields.some((f) => String(r[f.k] || '').toLowerCase().indexOf(q) > -1)); }
    return list;
  }

  function renderCrudRows(route) {
    const c = CRUD[route]; const st = crudState(route);
    const list = crudVisible(route);
    const canOrder = c.order && !st.q && st.cat === 'semua';
    const box = $('#rows-' + route); if (!box) return;
    if (!list.length) {
      box.innerHTML = `<div class="empty-st"><i class="bi bi-inboxes" aria-hidden="true"></i><b>${st.q ? 'Tidak ada hasil' : 'Belum ada data'}</b>${st.q ? 'Coba kata kunci lain.' : 'Tambahkan data pertama Anda.'}${st.q ? '' : `<br><button type="button" class="btn btn-primary" data-add="${route}"><i class="bi bi-plus-lg"></i>Tambah ${esc(c.single)}</button>`}</div>`;
      return;
    }
    box.innerHTML = `<div class="rows">${list.map((r, i) => `
      <div class="row${c.toggle && !isOn(r.tampil) ? ' off' : ''}" data-row="${route}" data-id="${esc(r.id)}">
        ${canOrder ? `<div class="order-btns"><button type="button" class="ibtn" data-move="-1" aria-label="Naikkan urutan"${i === 0 ? ' disabled' : ''}><i class="bi bi-chevron-up"></i></button><button type="button" class="ibtn" data-move="1" aria-label="Turunkan urutan"${i === list.length - 1 ? ' disabled' : ''}><i class="bi bi-chevron-down"></i></button></div>` : ''}
        ${c.vis(r)}
        <div class="row-main"><b>${esc(c.rowTitle(r))}</b><small>${esc(c.rowSub(r) || '')}</small></div>
        ${c.extra ? `<div class="row-extra">${c.extra(r)}</div>` : ''}
        ${c.toggle ? `<label class="switch" title="Tampilkan di situs"><input type="checkbox" data-toggle ${isOn(r.tampil) ? 'checked' : ''} aria-label="Tampilkan ${esc(c.rowTitle(r))} di situs"><span class="track"></span></label>` : ''}
        <div class="row-acts"><button type="button" class="ibtn" data-edit aria-label="Ubah ${esc(c.rowTitle(r))}"><i class="bi bi-pencil-square"></i></button><button type="button" class="ibtn danger" data-del aria-label="Hapus ${esc(c.rowTitle(r))}"><i class="bi bi-trash3"></i></button></div>
      </div>`).join('')}</div>
      <p class="hint" style="margin-top:12px">${list.length} data${canOrder ? ' · gunakan panah untuk mengatur urutan tampil' : c.order ? ' · kosongkan pencarian/filter untuk mengatur urutan' : ''}</p>`;
  }

  // ── Komponen field formulir ──
  function fieldHtml(f, v, scope) {
    const id = scope + '_' + f.k;
    const val = v === undefined || v === null ? '' : plain(v);
    const req = f.req ? ' <span class="req" aria-hidden="true">*</span>' : '';
    const full = f.full ? ' full' : '';
    const attrs = scope === 'prof' ? ` data-prof="${f.k}"` : ` name="${f.k}"`;
    let inner = '';
    switch (f.t || 'text') {
      case 'textarea':
        inner = `<textarea class="input" id="${id}"${attrs} maxlength="${f.max || 600}" placeholder="${esc(f.ph || '')}">${esc(val)}</textarea>`; break;
      case 'select':
        inner = `<select class="select" id="${id}"${attrs} style="width:100%">${f.opts.map(([a, b]) => `<option value="${a}"${a === val ? ' selected' : ''}>${b}</option>`).join('')}</select>`; break;
      case 'range': {
        const n = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
        inner = `<div class="range-row"><input type="range" id="${id}"${attrs} min="0" max="100" step="1" value="${n}" data-range-out><output class="tnum">${n}%</output></div>`; break;
      }
      case 'stars': {
        const n = Math.max(1, Math.min(5, parseInt(val, 10) || 5));
        inner = `<input type="hidden"${attrs} value="${n}"><div class="star-pick" role="radiogroup" aria-label="${f.l}">${[1, 2, 3, 4, 5].map((i) => `<button type="button" role="radio" aria-checked="${i === n}" data-star="${i}" class="${i <= n ? 'on' : ''}" aria-label="${i} bintang"><i class="bi bi-star-fill"></i></button>`).join('')}</div>`; break;
      }
      case 'icon': {
        const cur = icon(val || f.opts[0]);
        inner = `<input type="hidden"${attrs} value="${esc(cur)}"><div class="icon-pick" role="radiogroup" aria-label="Pilih ikon">${f.opts.map((i) => `<button type="button" role="radio" aria-checked="${i === cur}" data-icon="${i}" class="${i === cur ? 'on' : ''}" title="${i}"><i class="bi bi-${i}"></i></button>`).join('')}</div><input class="input" style="margin-top:8px;min-height:38px;font-size:13px" placeholder="Atau ketik nama ikon Bootstrap Icons, mis. rocket-takeoff" value="${f.opts.indexOf(cur) > -1 ? '' : esc(cur)}" data-icon-custom>`; break;
      }
      case 'switch':
        return `<div class="field${full}" data-f="${f.k}"><label class="switch"><input type="checkbox"${attrs} ${isOn(v) ? 'checked' : ''}><span class="track"></span>${f.l}</label></div>`;
      case 'image':
        inner = uploaderHtml('ff_' + f.k, val, f.kind || 'foto', f.k); break;
      default: {
        const type = f.t === 'url' ? 'url' : f.t === 'number' ? 'number' : 'text';
        const list = f.list ? Array.from(new Set((A.d[CRUD[A.form && A.form.route] ? CRUD[A.form.route].key : 'keahlian'] || []).map((r) => plain(r[f.k])).filter(Boolean))) : [];
        inner = `<input class="input" id="${id}"${attrs} type="${type}" value="${esc(val)}" ${type === 'number' ? 'min="0" max="80"' : `maxlength="${f.max || 300}"`} placeholder="${esc(f.ph || '')}"${f.list ? ` list="dl_${f.k}"` : ''}>${f.list ? `<datalist id="dl_${f.k}">${list.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}`;
      }
    }
    return `<div class="field${full}" data-f="${f.k}"><label for="${id}">${f.l}${req}</label>${inner}${f.hint ? `<small class="hint">${f.hint}</small>` : ''}<span class="msg" role="alert"><i class="bi bi-exclamation-circle" aria-hidden="true"></i><span></span></span></div>`;
  }

  function showErr(fieldEl, msg) {
    if (!fieldEl) return;
    fieldEl.classList.toggle('err', !!msg);
    const m = $('.msg span', fieldEl); if (m) m.textContent = msg || '';
  }

  function openForm(route, rec) {
    const c = CRUD[route];
    const st = crudState(route);
    const isNew = !rec;
    const r = rec ? Object.assign({}, rec) : Object.assign({ id: uuid() }, c.blank ? c.blank(st) : {});
    A.form = { route, rec: r, isNew };
    $('#formTitle').textContent = (isNew ? 'Tambah ' : 'Ubah ') + c.single.toLowerCase();
    $('#formBody').innerHTML = c.fields.map((f) => fieldHtml(f, r[f.k], 'ff')).join('');
    openModal('#formModal');
    setTimeout(() => { const el = $('#formBody .input, #formBody .select'); if (el) el.focus(); }, 80);
  }

  function readForm() {
    const c = CRUD[A.form.route];
    const out = Object.assign({}, A.form.rec);
    const errs = {};
    c.fields.forEach((f) => {
      const el = $(`#crudForm [name="${f.k}"]`);
      let v;
      if (f.t === 'switch') v = !!(el && el.checked);
      else if (f.t === 'range' || f.t === 'stars') v = parseInt(el && el.value, 10) || 0;
      else v = String(el ? el.value : '').trim();
      out[f.k] = v;
      const pendingImg = f.t === 'image' && A.uploads['ff_' + f.k];
      if (f.req && v === '') errs[f.k] = f.l + ' wajib diisi.';
      else if ((f.t === 'url' || f.t === 'image') && v && !isHttps(v) && !pendingImg) errs[f.k] = f.l + ' harus diawali https:\/\/';
      else if (typeof v === 'string' && MARKUP.test(v)) errs[f.k] = 'Tidak boleh berisi kode HTML atau skrip.';
    });
    return { out, errs };
  }

  /** Simpan form: UI berubah seketika, server menyusul. Gagal → dikembalikan. */
  function submitCrud(e) {
    e.preventDefault();
    const { out, errs } = readForm();
    $$('#formBody .field').forEach((f) => showErr(f, errs[f.getAttribute('data-f')]));
    const first = Object.keys(errs)[0];
    if (first) { const el = $(`#formBody [data-f="${first}"] .input, #formBody [data-f="${first}"] .select`); if (el) el.focus(); return; }
    const route = A.form.route; const c = CRUD[route]; const isNew = A.form.isNew;
    const list = A.d[c.key];
    const snapshot = list.map((x) => Object.assign({}, x));
    if (isNew) {
      if (c.order) out.urutan = list.reduce((m, x) => Math.max(m, Number(x.urutan) || 0), 0) + 1;
      list.push(out);
    } else {
      const i = list.findIndex((x) => x.id === out.id);
      if (i > -1) list[i] = out; else list.push(out);
    }
    if (c.tabs && out.jenis) crudState(route).tab = out.jenis;
    closeModal('#formModal');
    rerender(route); persist();
    toast(isNew ? `${c.single} ditambahkan.` : 'Perubahan disimpan.', 'success');
    const imgF = c.fields.find((f) => f.t === 'image');
    const pend = imgF && A.uploads['ff_' + imgF.k];
    const send = () => sync('adminUpsert', [c.sheet, out], () => { A.d[c.key] = snapshot; rerender(route); });
    if (pend) {
      pend.then((url) => { out[imgF.k] = url; const it = A.d[c.key].find((x) => x.id === out.id); if (it) it[imgF.k] = url; rerender(route); send(); },
        () => { out[imgF.k] = isHttps(out[imgF.k]) ? out[imgF.k] : ''; send(); });
    } else send();
  }

  function toggleRow(route, id, on) {
    const c = CRUD[route];
    const r = A.d[c.key].find((x) => x.id === id); if (!r) return;
    r.tampil = on;
    const row = $(`[data-row="${route}"][data-id="${CSS.escape(id)}"]`); if (row) row.classList.toggle('off', !on);
    persist();
    toast(on ? `"${plain(c.rowTitle(r))}" ditampilkan di situs.` : `"${plain(c.rowTitle(r))}" disembunyikan.`, 'info', { duration: 2200 });
    sync('adminUpsert', [c.sheet, r], () => { r.tampil = !on; rerender(route); });
  }

  function moveRow(route, id, dir) {
    const c = CRUD[route];
    const vis = crudVisible(route);
    const i = vis.findIndex((x) => x.id === id); const j = i + dir;
    if (i < 0 || j < 0 || j >= vis.length) return;
    const full = A.d[c.key].slice().sort(byUrut);
    const snapshot = A.d[c.key].map((x) => Object.assign({}, x));
    const a = full.indexOf(vis[i]), b = full.indexOf(vis[j]);
    [full[a], full[b]] = [full[b], full[a]];
    full.forEach((x, k) => { x.urutan = k + 1; });
    A.d[c.key] = full;
    renderCrudRows(route); persist();
    const btn = $(`[data-row="${route}"][data-id="${CSS.escape(id)}"] [data-move="${dir}"]`); if (btn && !btn.disabled) btn.focus();
    sync('adminReorder', [c.sheet, full.map((x) => x.id)], () => { A.d[c.key] = snapshot; rerender(route); });
  }

  function deleteRow(route, id) {
    const c = CRUD[route];
    const list = A.d[c.key];
    const r = list.find((x) => x.id === id); if (!r) return;
    confirmBox({ title: `Hapus ${c.single.toLowerCase()}?`, msg: `"${plain(c.rowTitle(r))}" akan dihapus permanen dari situs dan spreadsheet.`, ok: 'Hapus' }).then((yes) => {
      if (!yes) return;
      const snapshot = list.map((x) => Object.assign({}, x));
      A.d[c.key] = list.filter((x) => x.id !== id);
      rerender(route); persist();
      toast(`"${plain(c.rowTitle(r))}" dihapus.`, 'success');
      sync('adminDelete', [c.sheet, [id]], () => { A.d[c.key] = snapshot; rerender(route); });
    });
  }

  // ════════════════════════════════════════════════════════
  // BAGIAN 9: A8 PESAN MASUK
  // ════════════════════════════════════════════════════════
  const PAGE_MSG = 10;
  function pesanFiltered() {
    const st = A.ui.pesan;
    let list = A.d.pesan.slice();
    if (st.status !== 'semua') list = list.filter((m) => m.status === st.status);
    if (st.range !== 'all') list = msgsIn(presetRange(st.range)).filter((m) => list.indexOf(m) > -1);
    if (st.q) { const q = st.q.toLowerCase(); list = list.filter((m) => [m.nama, m.email, m.pesan].some((x) => String(x || '').toLowerCase().indexOf(q) > -1)); }
    return list;
  }

  function renderPesan() {
    const st = A.ui.pesan; const nb = unread();
    const notif = A.d.settings.email_notifikasi || A.d.meta.adminEmail || '';
    $('#a-pesan').innerHTML = head('Kotak masuk formulir kontak', `Pesan Masuk ${nb ? `<span class="pill-count"><span class="dot" style="background:var(--navy)"></span>${nb} Pesan Baru</span>` : ''} <span class="accent">leads & peluang</span>`, '', `
        <span class="chip chip-sky"><i class="bi bi-envelope-paper" style="margin-right:6px"></i>Total ${fmt(A.d.pesan.length)} pesan</span>
        <button type="button" class="btn btn-ghost btn-sm" data-act="export-pesan"><i class="bi bi-download" aria-hidden="true"></i>Ekspor Excel</button>`) + `
      <div class="panel" style="padding:14px;margin-bottom:16px"><div class="toolbar" style="margin:0">
        <label class="search"><i class="bi bi-search" aria-hidden="true"></i><input class="input" type="search" placeholder="Cari nama, email, kata kunci…" value="${esc(st.q)}" data-pq aria-label="Cari pesan"></label>
        <select class="select" data-pstatus aria-label="Filter status"><option value="semua">Semua status</option><option value="baru"${st.status === 'baru' ? ' selected' : ''}>Baru (${nb})</option><option value="dibaca"${st.status === 'dibaca' ? ' selected' : ''}>Dibaca</option></select>
        <select class="select" data-prange aria-label="Rentang waktu">${[['7', '7 hari terakhir'], ['30', '30 hari terakhir'], ['90', '90 hari terakhir'], ['all', 'Semua waktu']].map(([v, l]) => `<option value="${v}"${st.range === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      </div></div>
      <div id="pesanBulk"></div>
      <div class="inbox"><div id="pesanList"></div><div class="msg-detail" id="pesanDetail"></div></div>
      <div class="foot-note"><span><i class="bi bi-shield-check"></i> Setiap pesan baru juga dikirim sebagai notifikasi ke <b>${esc(notif || 'email admin')}</b>.</span><button type="button" class="link" data-act="refresh"><i class="bi bi-arrow-clockwise"></i>Cek pesan terbaru</button></div>`;
    renderPesanList(); renderPesanDetail();
  }

  function renderPesanList() {
    const st = A.ui.pesan;
    const list = pesanFiltered();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_MSG));
    st.page = Math.min(st.page, pages - 1);
    const slice = list.slice(st.page * PAGE_MSG, st.page * PAGE_MSG + PAGE_MSG);
    const allSel = slice.length && slice.every((m) => st.sel.has(m.id));
    $('#pesanList').innerHTML = list.length ? `<div class="msg-list">
      <div class="msg-list-head"><label class="cbx"><input type="checkbox" data-psel-all ${allSel ? 'checked' : ''} aria-label="Pilih semua di halaman ini"></label><span>Pengirim & pesan</span><span style="margin-left:auto">Waktu</span></div>
      ${slice.map((m) => `
        <div class="msg-item${m.status === 'baru' ? ' unread' : ''}${st.open === m.id ? ' cur' : ''}" data-open-msg="${esc(m.id)}" tabindex="0" role="button" aria-label="Buka pesan dari ${esc(m.nama)}">
          <label class="cbx" data-stop><input type="checkbox" data-psel="${esc(m.id)}" ${st.sel.has(m.id) ? 'checked' : ''} aria-label="Pilih pesan ${esc(m.nama)}"></label>
          <div class="msg-body">
            <div class="msg-line1"><b>${esc(m.nama)}</b><span class="em">${esc(m.email)}</span><time>${esc(timeLabel(m.timestamp))}</time></div>
            <div class="msg-snip">${esc(plain(m.pesan))}</div>
            <div><span class="st st-${m.status === 'baru' ? 'baru' : 'dibaca'}">${m.status === 'baru' ? 'Baru' : 'Dibaca'}</span></div>
          </div>
        </div>`).join('')}
      </div>${pagerHtml(st.page, pages, list.length, PAGE_MSG, 'pesan')}` : `<div class="empty-st"><i class="bi bi-inbox"></i><b>${A.d.pesan.length ? 'Tidak ada pesan yang cocok' : 'Belum ada pesan'}</b>${A.d.pesan.length ? 'Ubah filter atau kata kunci.' : 'Pesan dari formulir kontak akan muncul di sini.'}</div>`;
    renderBulk();
  }

  function pagerHtml(page, pages, total, size, key) {
    if (total <= size) return `<div class="pager"><span>Menampilkan ${fmt(total)} data</span></div>`;
    const from = page * size + 1, to = Math.min(total, (page + 1) * size);
    const nums = [];
    for (let i = 0; i < pages; i++) if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
    return `<div class="pager"><span>Menampilkan ${fmt(from)}–${fmt(to)} dari ${fmt(total)}</span><div class="pager-btns">
      <button type="button" data-page="${key}:${page - 1}" aria-label="Sebelumnya"${page === 0 ? ' disabled' : ''}><i class="bi bi-chevron-left"></i></button>
      ${nums.map((n) => n === '…' ? '<span>…</span>' : `<button type="button" data-page="${key}:${n}" class="${n === page ? 'cur' : ''}" aria-label="Halaman ${n + 1}"${n === page ? ' aria-current="page"' : ''}>${n + 1}</button>`).join('')}
      <button type="button" data-page="${key}:${page + 1}" aria-label="Berikutnya"${page >= pages - 1 ? ' disabled' : ''}><i class="bi bi-chevron-right"></i></button></div></div>`;
  }

  function renderBulk() {
    const st = A.ui.pesan;
    const el = $('#pesanBulk'); if (!el) return;
    // buang id yang sudah tidak ada
    st.sel.forEach((id) => { if (!A.d.pesan.some((m) => m.id === id)) st.sel.delete(id); });
    el.innerHTML = st.sel.size ? `<div class="bulk"><b><i class="bi bi-check2-circle"></i>${st.sel.size} pesan dipilih</b><div class="a-actions">
      <button type="button" class="btn" data-act="bulk-read"><i class="bi bi-envelope-open"></i>Tandai Dibaca</button>
      <button type="button" class="btn" data-act="bulk-unread"><i class="bi bi-envelope"></i>Tandai Baru</button>
      <button type="button" class="btn danger" data-act="bulk-del"><i class="bi bi-trash3"></i>Hapus</button>
      <button type="button" class="btn" data-act="bulk-clear" aria-label="Batalkan pilihan"><i class="bi bi-x-lg"></i></button></div></div>` : '';
  }

  function renderPesanDetail() {
    const st = A.ui.pesan;
    const el = $('#pesanDetail'); if (!el) return;
    const m = A.d.pesan.find((x) => x.id === st.open);
    if (!m) {
      el.classList.remove('show');
      el.innerHTML = `<div class="panel" style="text-align:center;padding:48px 24px"><span class="ic" style="margin:0 auto 14px;width:56px;height:56px;font-size:24px"><i class="bi bi-envelope-open"></i></span><h2 style="font-size:18px">Pilih pesan</h2><p class="muted" style="margin-top:6px">Klik salah satu pesan untuk membaca isinya.</p></div>`;
      return;
    }
    const subj = encodeURIComponent('Re: Pesan Anda di portofolio');
    el.innerHTML = `<button type="button" class="btn btn-ghost btn-sm detail-back" data-act="close-msg"><i class="bi bi-arrow-left"></i>Kembali ke daftar</button>
      <div class="panel">
        <div class="panel-head"><span class="eyebrow">Detail pesan</span><span class="st st-${m.status === 'baru' ? 'baru' : 'dibaca'}">${m.status === 'baru' ? 'Baru' : 'Dibaca'}</span></div>
        <div class="sender"><span class="avatar">${esc(initials(m.nama))}</span><div style="min-width:0"><b>${esc(m.nama)}</b><a href="mailto:${esc(m.email)}" target="_blank" rel="noopener">${esc(m.email)}</a></div></div>
        <div class="meta-row"><div><small>Waktu kirim</small><span>${esc(fullDate(m.timestamp))}</span></div><div><small>Sumber</small><span>Formulir kontak</span></div></div>
        <div class="msg-full">${esc(plain(m.pesan))}</div>
        <div class="detail-acts">
          <a class="btn btn-primary" href="mailto:${esc(m.email)}?subject=${subj}" target="_blank" rel="noopener"><i class="bi bi-reply"></i>Balas via Email</a>
          <button type="button" class="btn btn-ghost" data-act="msg-toggle" data-id="${esc(m.id)}"><i class="bi bi-envelope${m.status === 'baru' ? '-open' : ''}"></i>${m.status === 'baru' ? 'Tandai Dibaca' : 'Tandai Belum Dibaca'}</button>
          <button type="button" class="btn btn-ghost" data-act="msg-del" data-id="${esc(m.id)}" style="color:var(--danger)"><i class="bi bi-trash3"></i>Hapus</button>
        </div>
      </div>`;
  }

  function setStatus(ids, status) {
    const changed = A.d.pesan.filter((m) => ids.indexOf(m.id) > -1 && m.status !== status);
    if (!changed.length) return;
    const old = changed.map((m) => [m, m.status]);
    changed.forEach((m) => { m.status = status; });
    renderBadges(); if (A.route === 'pesan') { renderPesanList(); renderPesanDetail(); }
    persist();
    sync('adminSetPesanStatus', [changed.map((m) => m.id), status], () => { old.forEach(([m, s]) => { m.status = s; }); renderBadges(); rerender('pesan'); });
  }

  function openMessage(id) {
    const m = A.d.pesan.find((x) => x.id === id); if (!m) return;
    if (A.route !== 'pesan') navigate('pesan');
    A.ui.pesan.open = id;
    if (m.status === 'baru') setStatus([id], 'dibaca');
    renderPesanList(); renderPesanDetail();
    const d = $('#pesanDetail'); if (d && window.innerWidth < 1000) { d.classList.add('show'); d.scrollTop = 0; }
  }

  function deleteMessages(ids) {
    confirmBox({ title: ids.length > 1 ? `Hapus ${ids.length} pesan?` : 'Hapus pesan ini?', msg: 'Pesan akan dihapus permanen dari sheet Pesan.', ok: 'Hapus' }).then((yes) => {
      if (!yes) return;
      const snapshot = A.d.pesan.slice();
      A.d.pesan = A.d.pesan.filter((m) => ids.indexOf(m.id) === -1);
      ids.forEach((id) => A.ui.pesan.sel.delete(id));
      if (ids.indexOf(A.ui.pesan.open) > -1) A.ui.pesan.open = null;
      rerender('pesan'); persist();
      toast(ids.length > 1 ? `${ids.length} pesan dihapus.` : 'Pesan dihapus.', 'success');
      sync('adminDelete', ['Pesan', ids], () => { A.d.pesan = snapshot; rerender('pesan'); });
    });
  }

  // ════════════════════════════════════════════════════════
  // BAGIAN 10: A9 STATISTIK & LAPORAN
  // ════════════════════════════════════════════════════════
  const PAGE_LOG = 15;
  function statRange() {
    const s = A.ui.stat;
    if (s.preset === 'custom') {
      const to = s.to || dstr(new Date());
      const from = s.from || dstr(addDays(parseDay(to), -29));
      return from <= to ? { from, to } : { from: to, to: from };
    }
    return presetRange(s.preset);
  }
  function logFiltered() {
    const s = A.ui.stat; const r = statRange();
    return (A.d.stats.log || []).filter((x) => {
      const k = dstr(new Date(x[0]));
      if (k < r.from || k > r.to) return false;
      if (s.type !== 'semua' && x[1] !== s.type) return false;
      if (s.q && (plain(x[2]) + ' ' + x[3]).toLowerCase().indexOf(s.q.toLowerCase()) === -1) return false;
      return true;
    });
  }

  function renderStatistik() {
    const s = A.ui.stat; const r = statRange(); const pr = prevOf(r);
    const k = (t, rr) => sumN(aggIn(rr, t));
    const custom = s.preset === 'custom';
    $('#a-statistik').innerHTML = head('Telemetri pengunjung', 'Statistik & <span class="accent">laporan</span>', 'Pantau kunjungan, klik proyek, dan minat kerja sama. Semua grafik dihitung langsung dari data agregat.', `
        <button type="button" class="btn btn-ghost" data-act="export-xlsx"><i class="bi bi-file-earmark-spreadsheet" aria-hidden="true"></i>Unduh Excel</button>
        <button type="button" class="btn btn-primary" data-act="export-pdf"><i class="bi bi-file-earmark-pdf" aria-hidden="true"></i>Unduh PDF</button>`) + `
      <div class="panel" style="padding:14px;margin-bottom:18px"><div class="toolbar" style="margin:0">
        <select class="select" data-sfilter="preset" aria-label="Rentang waktu">${[['7', '7 hari terakhir'], ['30', '30 hari terakhir'], ['90', '90 hari terakhir'], ['year', 'Tahun ini'], ['all', 'Semua data'], ['custom', 'Rentang kustom…']].map(([v, l]) => `<option value="${v}"${s.preset === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
        ${custom ? `<input class="input" type="date" style="width:auto;min-height:44px" data-sfilter="from" value="${esc(s.from || r.from)}" aria-label="Dari tanggal"><span class="muted">s.d.</span><input class="input" type="date" style="width:auto;min-height:44px" data-sfilter="to" value="${esc(s.to || r.to)}" aria-label="Sampai tanggal">` : ''}
        <span class="chip" style="margin-left:auto"><i class="bi bi-calendar3" style="margin-right:6px"></i>${esc(rangeLabel(r))}</span>
      </div></div>
      <div class="grid g-kpi">
        ${kpiCard('Kunjungan', k('kunjungan', r), 'eye', trendHtml(k('kunjungan', r), pr ? k('kunjungan', pr) : null), pr ? 'vs periode sebelumnya' : '')}
        ${kpiCard('Klik Proyek', k('klik_proyek', r), 'cursor', trendHtml(k('klik_proyek', r), pr ? k('klik_proyek', pr) : null), pr ? 'vs periode sebelumnya' : '')}
        ${kpiCard('Klik Kontak', k('klik_kontak', r), 'send', trendHtml(k('klik_kontak', r), pr ? k('klik_kontak', pr) : null), pr ? 'vs periode sebelumnya' : '')}
        ${kpiCard('Klik CTA', k('klik_cta', r), 'hand-index', trendHtml(k('klik_cta', r), pr ? k('klik_cta', pr) : null), pr ? 'vs periode sebelumnya' : '', true)}
      </div>
      <div class="grid g-2 mt">
        <div class="panel"><div class="panel-head"><div><span class="eyebrow">Aktivitas lalu lintas</span><h2>Tren Kunjungan</h2><p>Kunjungan per ${series(r, 'kunjungan').unit}</p></div></div>
          <div class="chart-box sm"><canvas id="chVisits" role="img" aria-label="Grafik garis tren kunjungan"></canvas>${k('kunjungan', r) ? '' : '<div class="chart-empty">Belum ada kunjungan pada periode ini.</div>'}</div></div>
        <div class="panel"><div class="panel-head"><div><span class="eyebrow">Portofolio engagement</span><h2>Klik per Proyek</h2><p>Studi kasus yang paling banyak dibuka</p></div></div>${hbarHtml(groupBy(aggIn(r, 'klik_proyek'), 2), 6)}</div>
        <div class="panel"><div class="panel-head"><div><span class="eyebrow">Karakteristik pengunjung</span><h2>Proporsi Perangkat</h2><p>Berdasarkan kunjungan pada periode ini</p></div></div>${deviceHtml(groupBy(aggIn(r, 'kunjungan'), 3), 'chDevice')}</div>
        <div class="panel"><div class="panel-head"><div><span class="eyebrow">Saluran konversi</span><h2>Klik Tautan Kontak</h2><p>Kanal yang paling sering dipilih pengunjung</p></div></div>
          <div class="chart-box sm"><canvas id="chKontak" role="img" aria-label="Grafik batang klik tautan kontak"></canvas>${k('klik_kontak', r) ? '' : '<div class="chart-empty">Belum ada klik kontak pada periode ini.</div>'}</div></div>
      </div>
      <div class="panel mt">
        <div class="tabs" role="tablist"><button type="button" role="tab" data-stab="log" aria-selected="${s.tab === 'log'}"><i class="bi bi-activity"></i>Log Statistik</button><button type="button" role="tab" data-stab="pesan" aria-selected="${s.tab === 'pesan'}"><i class="bi bi-inbox"></i>Pesan Masuk</button></div>
        <div class="toolbar">
          <label class="search"><i class="bi bi-search" aria-hidden="true"></i><input class="input" type="search" placeholder="Cari target, perangkat, nama…" value="${esc(s.q)}" data-sfilter="q" aria-label="Cari di tabel"></label>
          ${s.tab === 'log' ? `<select class="select" data-sfilter="type" aria-label="Jenis event"><option value="semua">Semua jenis event</option>${Object.keys(EV_LABEL).map((t) => `<option value="${t}"${s.type === t ? ' selected' : ''}>${EV_LABEL[t]}</option>`).join('')}</select>` : ''}
        </div>
        <div id="statTable"></div>
      </div>`;
    renderStatTable();
    drawChart('chVisits', () => lineCfg(series(r, 'kunjungan'), 'Kunjungan'));
    const kon = groupBy(aggIn(r, 'klik_kontak'), 2).slice(0, 8);
    drawChart('chKontak', () => barCfg(kon.map((x) => x[0]), kon.map((x) => x[1]), 'Klik'));
    const dev = groupBy(aggIn(r, 'kunjungan'), 3);
    if (dev.length) drawChart('chDevice', () => donutCfg(dev));
  }

  function renderStatTable() {
    const s = A.ui.stat; const el = $('#statTable'); if (!el) return;
    let rows, total, headHtml, bodyFn;
    if (s.tab === 'log') {
      rows = logFiltered();
      headHtml = '<tr><th>Waktu</th><th>Jenis event</th><th>Target interaksi</th><th>Perangkat</th></tr>';
      bodyFn = (x) => `<tr><td style="white-space:nowrap">${esc(shortDate(x[0]))}</td><td><span class="ev ev-${esc(x[1])}"><i class="bi bi-${EV_ICON[x[1]] || 'dot'}"></i>${esc(EV_LABEL[x[1]] || x[1])}</span></td><td>${esc(plain(x[2]))}</td><td>${esc(DEV_LABEL[x[3]] || x[3])}</td></tr>`;
    } else {
      const r = statRange();
      rows = msgsIn(r).filter((m) => !s.q || [m.nama, m.email, m.pesan].some((x) => String(x || '').toLowerCase().indexOf(s.q.toLowerCase()) > -1));
      headHtml = '<tr><th>Tanggal</th><th>Nama</th><th>Email</th><th>Cuplikan pesan</th><th>Status</th></tr>';
      bodyFn = (m) => `<tr style="cursor:pointer" data-open-msg="${esc(m.id)}"><td style="white-space:nowrap">${esc(shortDate(m.timestamp))}</td><td><b>${esc(m.nama)}</b></td><td>${esc(m.email)}</td><td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(plain(m.pesan))}</td><td><span class="st st-${m.status === 'baru' ? 'baru' : 'dibaca'}">${m.status === 'baru' ? 'Baru' : 'Dibaca'}</span></td></tr>`;
    }
    total = rows.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_LOG));
    s.page = Math.min(s.page, pages - 1);
    const slice = rows.slice(s.page * PAGE_LOG, s.page * PAGE_LOG + PAGE_LOG);
    el.innerHTML = total ? `<div class="tbl-wrap"><table class="tbl"><thead>${headHtml}</thead><tbody>${slice.map(bodyFn).join('')}</tbody></table></div>${pagerHtml(s.page, pages, total, PAGE_LOG, 'stat')}
      ${s.tab === 'log' ? `<p class="hint" style="margin-top:8px">Log menampilkan maksimal 500 aktivitas terbaru. Ringkasan lengkap tersedia di Unduh Excel/PDF.</p>` : ''}`
      : '<div class="empty-st"><i class="bi bi-table"></i><b>Tidak ada data</b>Ubah rentang waktu atau filter.</div>';
  }

  /** Siapkan semua angka laporan sesuai filter aktif (dipakai Excel & PDF). */
  function reportData() {
    const r = statRange(); const pr = prevOf(r);
    const k = (t, rr) => sumN(aggIn(rr, t));
    const kpi = Object.keys(EV_LABEL).map((t) => [EV_LABEL[t], k(t, r), pr ? k(t, pr) : '-']);
    const sr = series(r, 'kunjungan');
    return {
      r, label: rangeLabel(r), kpi,
      daily: sr.keys.map((key, i) => [key, sr.values[i]]),
      unit: sr.unit,
      proj: groupBy(aggIn(r, 'klik_proyek'), 2),
      dev: groupBy(aggIn(r, 'kunjungan'), 3).map(([a, b]) => [DEV_LABEL[a] || a, b]),
      kontak: groupBy(aggIn(r, 'klik_kontak'), 2),
      cta: groupBy(aggIn(r, 'klik_cta'), 2),
      log: (A.d.stats.log || []).filter((x) => { const d = dstr(new Date(x[0])); return d >= r.from && d <= r.to; }),
      pesan: msgsIn(r)
    };
  }
  function fileTag(r) { return r.all ? 'semua-data' : `${r.from}_${r.to}`; }

  function busyBtn(sel, on) {
    const b = $(`[data-act="${sel}"]`); if (!b) return;
    if (on) { b.dataset.html = b.innerHTML; b.innerHTML = '<span class="spin-dark" style="width:16px;height:16px"></span>Menyiapkan…'; b.disabled = true; }
    else { if (b.dataset.html) b.innerHTML = b.dataset.html; b.disabled = false; }
  }

  function exportExcel(onlyPesan) {
    const act = onlyPesan ? 'export-pesan' : 'export-xlsx';
    busyBtn(act, true);
    loadOnce(CDN.xlsx).then(() => {
      const X = window.XLSX; const wb = X.utils.book_new();
      const add = (name, aoa) => {
        const ws = X.utils.aoa_to_sheet(aoa);
        const cols = Math.max(...aoa.map((r) => r.length));
        ws['!cols'] = Array.from({ length: cols }, (_, i) => ({ wch: Math.min(70, Math.max(12, ...aoa.map((r) => String(r[i] === undefined ? '' : r[i]).length + 2))) }));
        X.utils.book_append_sheet(wb, ws, name);
      };
      const pesanRows = (list) => [['Tanggal', 'Nama', 'Email', 'Pesan', 'Status']].concat(list.map((m) => [shortDate(m.timestamp), plain(m.nama), m.email, plain(m.pesan), m.status]));
      let fname;
      if (onlyPesan) {
        add('Pesan Masuk', pesanRows(pesanFiltered()));
        fname = `pesan-masuk_${dstr(new Date())}.xlsx`;
      } else {
        const R = reportData();
        add('Ringkasan', [['Laporan Statistik Portofolio'], ['Periode', R.label], ['Dibuat', new Date().toLocaleString('id-ID')], [], ['Metrik', 'Periode ini', 'Periode sebelumnya']].concat(R.kpi).concat([[], ['Pesan masuk', R.pesan.length]]));
        add('Kunjungan', [[R.unit === 'hari' ? 'Tanggal' : 'Bulan', 'Kunjungan']].concat(R.daily));
        add('Klik Proyek', [['Proyek', 'Klik']].concat(R.proj));
        add('Perangkat', [['Perangkat', 'Kunjungan']].concat(R.dev));
        add('Klik Kontak', [['Kanal', 'Klik']].concat(R.kontak));
        add('Klik CTA', [['Tombol', 'Klik']].concat(R.cta));
        add('Log Statistik', [['Waktu', 'Jenis event', 'Target', 'Perangkat']].concat(R.log.map((x) => [shortDate(x[0]), EV_LABEL[x[1]] || x[1], plain(x[2]), DEV_LABEL[x[3]] || x[3]])));
        add('Pesan Masuk', pesanRows(R.pesan));
        fname = `laporan-portofolio_${fileTag(R.r)}.xlsx`;
      }
      X.writeFile(wb, fname);
      toast('File Excel diunduh: ' + fname, 'success');
    }).catch((err) => toast(err.message, 'error')).finally(() => busyBtn(act, false));
  }

  /** jsPDF bawaan hanya mendukung Latin-1 → normalisasi karakter khusus. */
  const pdfText = (s) => plain(s).replace(/[–—]/g, '-').replace(/[•·]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');

  function exportPdf() {
    busyBtn('export-pdf', true);
    loadOnce(CDN.jspdf).then(() => loadOnce(CDN.autotable)).then(() => {
      const R = reportData();
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight();
      const nama = pdfText(A.d.profil.nama_lengkap || 'Portofolio');
      doc.setFillColor(11, 31, 58); doc.rect(0, 0, W, 78, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
      doc.text('Laporan Statistik Portofolio', 40, 40);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.text(pdfText(`${nama}  |  Periode: ${R.label}  |  Dibuat: ${new Date().toLocaleString('id-ID')}`), 40, 60);
      doc.setTextColor(11, 31, 58);
      let y = 104;
      const table = (title, headRow, body, opts) => {
        if (y > H - 120) { doc.addPage(); y = 50; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(title, 40, y);
        doc.autoTable(Object.assign({
          startY: y + 8, head: [headRow],
          body: body.length ? body.map((r) => r.map((c) => (typeof c === 'number' ? fmt(c) : pdfText(c)))) : [[{ content: 'Tidak ada data pada periode ini', colSpan: headRow.length, styles: { halign: 'center', textColor: [91, 100, 114] } }]],
          theme: 'grid', styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, overflow: 'linebreak', lineColor: [226, 232, 240] },
          headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [248, 249, 255] },
          margin: { left: 40, right: 40 }
        }, opts || {}));
        y = doc.lastAutoTable.finalY + 26;
      };
      table('Ringkasan', ['Metrik', 'Periode ini', 'Periode sebelumnya'], R.kpi.concat([['Pesan masuk', R.pesan.length, '-']]));
      table('Klik per Proyek', ['Proyek', 'Klik'], R.proj);
      table('Proporsi Perangkat', ['Perangkat', 'Kunjungan'], R.dev);
      table('Klik Tautan Kontak', ['Kanal', 'Klik'], R.kontak);
      table(R.unit === 'hari' ? 'Kunjungan Harian' : 'Kunjungan Bulanan', [R.unit === 'hari' ? 'Tanggal' : 'Bulan', 'Kunjungan'], R.daily.filter((x) => x[1] > 0));
      table('Log Statistik (maks. 300 terbaru)', ['Waktu', 'Jenis', 'Target', 'Perangkat'], R.log.slice(0, 300).map((x) => [shortDate(x[0]), EV_LABEL[x[1]] || x[1], plain(x[2]), DEV_LABEL[x[3]] || x[3]]));
      table('Pesan Masuk', ['Tanggal', 'Nama', 'Email', 'Pesan', 'Status'], R.pesan.slice(0, 200).map((m) => [shortDate(m.timestamp), m.nama, m.email, plain(m.pesan).slice(0, 300), m.status]), { columnStyles: { 3: { cellWidth: 190 } } });
      const n = doc.getNumberOfPages();
      for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(91, 100, 114); doc.text(`Halaman ${i} dari ${n}`, W - 40, H - 20, { align: 'right' }); }
      const fname = `laporan-portofolio_${fileTag(R.r)}.pdf`;
      doc.save(fname);
      toast('File PDF diunduh: ' + fname, 'success');
    }).catch((err) => toast(err.message, 'error')).finally(() => busyBtn('export-pdf', false));
  }

  // ════════════════════════════════════════════════════════
  // BAGIAN 11: A10 PENGATURAN
  // ════════════════════════════════════════════════════════
  const SWATCHES = [['Action Blue', '#2563EB'], ['Deep Navy', '#0B1F3A'], ['Indigo', '#4F46E5'], ['Teal', '#0F766E'], ['Crimson', '#BE123C']];

  function setField(k, label, opts) {
    opts = opts || {};
    const v = plain(A.ui.set[k] === undefined ? '' : A.ui.set[k]);
    const id = 'set_' + k;
    const input = opts.area
      ? `<textarea class="input" id="${id}" data-set="${k}" maxlength="${opts.max || 300}" placeholder="${esc(opts.ph || '')}">${esc(v)}</textarea>`
      : `<input class="input" id="${id}" data-set="${k}" type="${opts.type || 'text'}" value="${esc(v)}" maxlength="${opts.max || 300}" placeholder="${esc(opts.ph || '')}">`;
    return `<div class="field${opts.full ? ' full' : ''}" data-f="${k}"><label for="${id}">${label}</label>${input}${opts.hint ? `<small class="hint">${opts.hint}</small>` : ''}<span class="msg" role="alert"><i class="bi bi-exclamation-circle"></i><span></span></span></div>`;
  }
  function setSwitch(k, title, desc) {
    return `<div class="set-row"><div><b>${title}</b><small>${desc}</small></div><label class="switch"><input type="checkbox" data-set="${k}" ${A.ui.set[k] ? 'checked' : ''} aria-label="${esc(title)}"><span class="track"></span></label></div>`;
  }

  function renderPengaturan() {
    if (!A.ui.set) A.ui.set = Object.assign({}, A.d.settings);
    const s = A.ui.set; const m = A.d.meta;
    const cur = String(s.warna_utama || '#2563EB').toUpperCase();
    const isPreset = SWATCHES.some(([, h]) => h === cur);
    const url = adminUrl();
    $('#a-pengaturan').innerHTML = head('Konfigurasi inti portofolio', 'Pengaturan <span class="accent">sistem</span>', 'Kelola identitas publik, tema, notifikasi, teks landing page, dan keamanan akses dashboard.') + `
      <div class="grid g-2" style="align-items:start">
        <div class="panel"><div class="panel-head"><div><h2><i class="bi bi-globe2" style="color:var(--primary)"></i> Pengaturan Situs</h2><p>Metadata & visibilitas</p></div></div>
          ${setField('judul_situs', 'Judul situs publik', { max: 120, hint: 'Tampil di tab browser dan hasil pencarian.' })}
          ${setField('meta_deskripsi', 'Meta deskripsi SEO', { area: 1, max: 300, hint: `Disarankan 120–160 karakter · <span data-count="meta_deskripsi">${plain(s.meta_deskripsi).length}</span> karakter` })}
          ${setSwitch('situs_aktif', 'Status publikasi situs', 'Matikan untuk menampilkan halaman "sedang diperbarui".')}
        </div>
        <div class="panel"><div class="panel-head"><div><h2><i class="bi bi-palette" style="color:var(--primary)"></i> Tampilan & Tema</h2><p>Warna aksen tombol & elemen interaktif</p></div></div>
          <div class="swatches" role="radiogroup" aria-label="Warna utama">${SWATCHES.map(([n, h]) => `<button type="button" class="swatch${cur === h ? ' on' : ''}" data-swatch="${h}" role="radio" aria-checked="${cur === h}"><i class="c" style="background:${h}">${cur === h ? '<i class="bi bi-check-lg"></i>' : ''}</i>${n}<small>${h}</small></button>`).join('')}
            <label class="swatch${isPreset ? '' : ' on'}" style="position:relative"><i class="c" style="background:${esc(cur)}"><i class="bi bi-eyedropper"></i></i>Kustom<small>${isPreset ? 'pilih warna' : esc(cur)}</small><input type="color" value="${esc(cur)}" data-set-color style="position:absolute;inset:0;opacity:0;cursor:pointer" aria-label="Warna kustom"></label></div>
          <div style="margin-top:16px">${setSwitch('info_bar_aktif', 'Bilah info atas', 'Tampilkan email, telepon, dan waktu respons di atas navbar.')}</div>
          ${setField('info_bar_teks', 'Teks waktu respons', { max: 80, ph: 'Balas pesan dalam < 24 jam' })}
          ${setField('status_tersedia', 'Status ketersediaan', { max: 80, ph: 'Tersedia untuk proyek Q4 2026', hint: 'Tampil di kartu kontak dan footer.' })}
        </div>
        <div class="panel"><div class="panel-head"><div><h2><i class="bi bi-envelope-paper" style="color:var(--primary)"></i> Notifikasi Email</h2><p>Penerusan pesan masuk</p></div></div>
          ${setField('email_notifikasi', 'Email penerima notifikasi', { type: 'email', max: 150, ph: m.adminEmail || 'email@domain.com', hint: 'Kosongkan untuk memakai ADMIN_EMAIL. Setiap pesan formulir kontak dikirim ke alamat ini.' })}
          <div class="set-row"><div><b>Kuota email harian</b><small>Akun Gmail biasa ±100 email/hari; anti-spam membatasi 5 pesan/jam per perangkat.</small></div><i class="bi bi-shield-check" style="color:var(--success);font-size:20px"></i></div>
        </div>
        <div class="panel"><div class="panel-head"><div><h2><i class="bi bi-person-lines-fill" style="color:var(--primary)"></i> Kontak Publik</h2><p>Tampil di info bar, kartu kontak, dan footer</p></div></div>
          <div class="fgrid">
            ${setField('email_publik', 'Email publik', { type: 'email', max: 150 })}
            ${setField('telepon', 'Telepon / WhatsApp', { max: 40, ph: '+62 812-…' })}
            ${setField('lokasi', 'Lokasi', { max: 100 })}
            ${setField('zona_waktu', 'Zona waktu', { max: 40, ph: 'WIB (UTC+7)' })}
          </div>
        </div>
        <div class="panel" style="grid-column:1/-1"><div class="panel-head"><div><h2><i class="bi bi-type" style="color:var(--primary)"></i> Teks Bagian Landing Page</h2><p>Kalimat pendukung di setiap bagian, tanpa menyentuh kode</p></div></div>
          <div class="fgrid">
            ${setField('kutipan', 'Kutipan di kartu About', { area: 1, max: 500 })}
            ${setField('prinsip_kerja', 'Prinsip kerja (satu baris = satu poin)', { area: 1, max: 800 })}
            ${setField('tagar', 'Tagar (pisahkan koma)', { max: 200 })}
            ${setField('tagline_footer', 'Tagline footer', { max: 400 })}
            ${setField('sub_tentang', 'Subjudul bagian Tentang', { max: 300 })}
            ${setField('sub_keahlian', 'Subjudul bagian Keahlian', { max: 300 })}
            ${setField('sub_portofolio', 'Subjudul bagian Portofolio', { max: 300 })}
            ${setField('sub_testimoni', 'Subjudul bagian Testimoni', { max: 300 })}
            ${setField('sub_kontak', 'Subjudul pita Kontak', { max: 300, full: 1 })}
          </div>
        </div>
        <div class="panel"><div class="panel-head"><div><h2><i class="bi bi-shield-lock" style="color:var(--primary)"></i> Keamanan & Akses</h2><p>Siapa yang boleh masuk dashboard</p></div><span class="badge-dark">Kerahasiaan tinggi</span></div>
          <div class="field"><label for="admEmailRo">Email Super Admin</label><input class="input" id="admEmailRo" value="${esc(m.adminEmail || '')}" readonly><small class="hint">Diubah melalui Script Properties → ADMIN_EMAIL.</small></div>
          <div class="field"><label for="admUrl">Alamat rahasia masuk dashboard</label>
            <div class="secret"><input class="input" id="admUrl" type="${A.ui.showUrl ? 'text' : 'password'}" value="${esc(url)}" readonly>
            <button type="button" class="icon-btn" data-act="toggle-url" aria-label="${A.ui.showUrl ? 'Sembunyikan' : 'Tampilkan'} alamat"><i class="bi bi-eye${A.ui.showUrl ? '-slash' : ''}"></i></button>
            <button type="button" class="icon-btn" data-act="copy-url" aria-label="Salin alamat"><i class="bi bi-copy"></i></button></div>
            <small class="hint">Simpan baik-baik (mis. di bookmark). Tanpa alamat ini, halaman admin tidak bisa dipakai.</small></div>
          <div class="pw-box">
            <div class="set-row" style="border:0;padding-top:0"><div><b>Kata sandi cadangan</b><small>Dipakai bila login akun Google bermasalah (mis. di HP orang lain).</small></div><span class="st ${m.passwordSet ? 'st-on' : 'st-off'}">${m.passwordSet ? 'Aktif' : 'Belum diatur'}</span></div>
            <div class="fgrid">
              ${m.passwordSet && needOldPw() ? `<div class="field full" data-f="old"><label for="pwOld">Kata sandi lama</label><input class="input" id="pwOld" type="password" autocomplete="current-password" maxlength="128"><span class="msg" role="alert"><i class="bi bi-exclamation-circle"></i><span></span></span></div>` : ''}
              <div class="field" data-f="password"><label for="pwNew">${m.passwordSet ? 'Kata sandi baru' : 'Kata sandi'}</label><input class="input" id="pwNew" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="Minimal 8 karakter"><span class="msg" role="alert"><i class="bi bi-exclamation-circle"></i><span></span></span></div>
              <div class="field" data-f="password2"><label for="pwNew2">Ulangi kata sandi</label><input class="input" id="pwNew2" type="password" autocomplete="new-password" maxlength="128"><span class="msg" role="alert"><i class="bi bi-exclamation-circle"></i><span></span></span></div>
            </div>
            <div class="a-actions"><button type="button" class="btn btn-primary btn-sm" data-act="save-pw"><i class="bi bi-key"></i>${m.passwordSet ? 'Ganti Kata Sandi' : 'Aktifkan Kata Sandi'}</button>${m.passwordSet ? '<button type="button" class="btn btn-ghost btn-sm" data-act="remove-pw">Nonaktifkan</button>' : ''}</div>
          </div>
          <div class="warn-box"><b><i class="bi bi-exclamation-triangle"></i> Alamat bocor atau perangkat hilang?</b><p>Ganti alamat rahasia: alamat lama langsung mati dan sesi di perangkat lain diputus. Atau putuskan semua sesi tanpa mengganti alamat.</p>
            <div class="a-actions"><button type="button" class="btn btn-yellow btn-sm" data-act="regen-key"><i class="bi bi-arrow-repeat"></i>Ganti Alamat Rahasia</button><button type="button" class="btn btn-ghost btn-sm" data-act="logout-all"><i class="bi bi-phone"></i>Keluar dari Semua Perangkat</button></div></div>
        </div>
        <div class="panel"><div class="panel-head"><div><h2><i class="bi bi-lightning-charge" style="color:var(--primary)"></i> Server, Data & Kecepatan</h2><p>Google Sheets, Apps Script, GitHub Pages</p></div></div>
          <div class="set-row"><div><b>Spreadsheet database</b><small>9 sheet: Profil, Tentang, Keahlian, Portofolio, Testimoni, Kontak, Pesan, Statistik, Pengaturan.</small></div>${m.spreadsheetUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(m.spreadsheetUrl)}" target="_blank" rel="noopener">Buka <i class="bi bi-box-arrow-up-right"></i></a>` : ''}</div>
          <div class="set-row"><div><b>Alamat API (Apps Script)</b><small class="mono">${esc(P.GAS_URL)}</small></div><button type="button" class="icon-btn" data-act="copy-api" aria-label="Salin alamat API"><i class="bi bi-copy"></i></button></div>
          <div class="set-row"><div><b>Cache konten publik</b><small>Dibangun ulang otomatis setiap Anda menyimpan perubahan. Pengunjung lama melihat situs seketika dari cache perangkat.</small></div><span class="st st-on">Aktif</span></div>
          ${turboRow(m.turbo || {})}
          <div class="set-row"><div><b>Versi aplikasi</b><small>Zona waktu server: ${esc(m.timezone || '-')} · data dashboard juga tersimpan di browser ini agar terbuka seketika (tekan Keluar di komputer umum).</small></div><span class="chip">${esc(m.version || '2.0.0')}</span></div>
        </div>
      </div>
      <div id="setBar"></div>`;
    renderSetBar();
  }

  function renderSetBar() {
    const el = $('#setBar'); if (!el) return;
    el.innerHTML = A.ui.setDirty ? `<div class="save-bar"><span><i class="bi bi-arrow-repeat"></i>Ada perubahan konfigurasi yang belum disimpan</span><div class="a-actions"><button type="button" class="btn btn-ghost" data-act="cancel-set">Batal</button><button type="button" class="btn btn-primary" data-act="save-set"><i class="bi bi-floppy"></i>Simpan Pengaturan <span class="hint" style="color:inherit;opacity:.8">(Ctrl+S)</span></button></div></div>` : '';
  }
  function markSetDirty() { if (!A.ui.setDirty) { A.ui.setDirty = true; renderSetBar(); } }

  function saveSettings() {
    const s = Object.assign({}, A.ui.set);
    const errs = {};
    ['email_publik', 'email_notifikasi'].forEach((k) => { if (s[k] && !isEmail(s[k])) errs[k] = 'Format email belum benar.'; });
    Object.keys(s).forEach((k) => { if (typeof s[k] === 'string' && MARKUP.test(s[k])) errs[k] = 'Tidak boleh berisi kode HTML.'; });
    if (!/^#[0-9a-f]{6}$/i.test(s.warna_utama || '')) errs.warna_utama = 'Warna tidak valid.';
    $$('#a-pengaturan .field').forEach((f) => showErr(f, errs[f.getAttribute('data-f')]));
    const first = Object.keys(errs)[0];
    if (first) { const el = $(`#a-pengaturan [data-f="${first}"] .input`); if (el) el.focus(); toast('Periksa kembali isian yang ditandai.', 'error'); return; }
    const old = Object.assign({}, A.d.settings);
    A.d.settings = Object.assign({}, s);
    A.ui.setDirty = false; renderSetBar(); persist();
    P.applyTheme(A.d.settings);
    toast('Pengaturan disimpan.', 'success');
    sync('adminSaveSettings', [s], () => { A.d.settings = old; A.ui.set = s; A.ui.setDirty = true; P.applyTheme(old); rerender('pengaturan'); });
  }

  function regenKey() {
    confirmBox({ title: 'Ganti alamat rahasia?', msg: 'Alamat lama langsung tidak berlaku. Sesi admin di perangkat lain akan diputus. Salin alamat baru setelah ini.', ok: 'Ganti Alamat', tone: 'warn', icon: 'arrow-repeat' }).then((yes) => {
      if (!yes) return;
      busyBtn('regen-key', true);
      call('adminRegenerateKey').then((res) => {
        if (!res.success) throw new Error(res.message);
        A.key = res.data.key; LS.set(KKEY, A.key); LS.del(GKEY);   // token baru sudah disimpan otomatis
        A.ui.showUrl = true;
        persist(); renderPengaturan();
        toast('Alamat rahasia baru dibuat. Salin dan simpan sekarang.', 'success', { duration: 8000 });
      }).catch((err) => { if (!err.auth) toast(err.message || 'Gagal mengganti alamat.', 'error'); busyBtn('regen-key', false); });
    });
  }

  /** Metode login sesi ini (dibaca dari isi token; bukan rahasia). */
  function needOldPw() {
    try {
      const p = String(A.token).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(p)).m === 'pw';
    } catch (e) { return true; }
  }

  function savePassword() {
    const f = (id) => $('#a-pengaturan [data-f="' + id + '"]');
    const old = $('#pwOld') ? $('#pwOld').value : '';
    const a = $('#pwNew').value, b = $('#pwNew2').value;
    ['old', 'password', 'password2'].forEach((k) => { if (f(k)) showErr(f(k), ''); });
    if ($('#pwOld') && !old) { showErr(f('old'), 'Isi kata sandi lama.'); $('#pwOld').focus(); return; }
    if (a.length < 8) { showErr(f('password'), 'Minimal 8 karakter.'); $('#pwNew').focus(); return; }
    if (a !== b) { showErr(f('password2'), 'Kata sandi tidak sama.'); $('#pwNew2').focus(); return; }
    busyBtn('save-pw', true);
    call('setPassword', { old, password: a }).then((res) => {
      busyBtn('save-pw', false);
      if (!res.success) {
        const fld = res.data && res.data.field;
        if (fld && f(fld)) { showErr(f(fld), res.message); const i = $('input', f(fld)); if (i) i.focus(); } else toast(res.message, 'error');
        return;
      }
      A.d.meta.passwordSet = true; persist();
      const g = LS.get(GKEY); if (g) { g.password = true; LS.set(GKEY, g); }
      renderPengaturan();
      toast('Kata sandi tersimpan. Bisa dipakai di layar login.', 'success');
    }).catch(() => busyBtn('save-pw', false));
  }

  function removePassword() {
    confirmBox({ title: 'Nonaktifkan kata sandi?', msg: 'Login hanya bisa lewat akun Google setelah ini.', ok: 'Nonaktifkan', tone: 'warn', icon: 'key' }).then((yes) => {
      if (!yes) return;
      const old = $('#pwOld') ? $('#pwOld').value : '';
      call('setPassword', { remove: true, old }).then((res) => {
        if (!res.success) { toast(res.message, 'error'); return; }
        A.d.meta.passwordSet = false; persist();
        const g = LS.get(GKEY); if (g) { g.password = false; LS.set(GKEY, g); }
        renderPengaturan(); toast('Login kata sandi dinonaktifkan.', 'success');
      }).catch(() => {});
    });
  }

  function logoutAll() {
    confirmBox({ title: 'Keluar dari semua perangkat?', msg: 'Semua sesi admin (termasuk perangkat ini) diputus. Anda perlu masuk lagi.', ok: 'Keluar Semua', tone: 'warn', icon: 'phone' }).then((yes) => {
      if (!yes) return;
      call('logoutAll', {}).then((res) => {
        if (!res.success) { toast(res.message, 'error'); return; }
        clearSession(); destroyCharts(); screen('admOut');
      }).catch(() => {});
    });
  }

  /** Baris status Mode Turbo (snapshot konten di CDN GitHub). */
  function turboRow(t) {
    if (!t.on) {
      return '<div class="set-row"><div><b>Mode Turbo</b><small>Opsional. Pengunjung pertama memuat konten dari CDN GitHub tanpa menunggu server Google. Lihat PANDUAN-INSTALASI.md bagian 7.</small></div><span class="st st-off">Nonaktif</span></div>';
    }
    const fresh = t.h && t.h === t.cur;
    const when = t.at ? fullDate(t.at) : 'belum pernah';
    return `<div class="set-row"><div><b>Mode Turbo</b><small>Snapshot di <span class="mono">${esc(t.repo)}</span> (cabang ${esc(t.branch)}) · terbit: ${esc(when)}${t.err ? ` · <span style="color:var(--danger)">${esc(t.err)}</span>` : ''}${fresh ? '' : ' · perubahan terbaru terbit otomatis dalam ±5 menit'}</small></div>
      <div class="a-actions" style="flex:none"><span class="st ${fresh ? 'st-on' : 'st-baru'}">${fresh ? 'Terbaru' : 'Menunggu'}</span><button type="button" class="btn btn-ghost btn-sm" data-act="publish-now"><i class="bi bi-cloud-upload"></i>Terbitkan</button></div></div>`;
  }

  function publishNow() {
    busyBtn('publish-now', true);
    call('publishNow', {}).then((res) => {
      busyBtn('publish-now', false);
      if (!res.success) { toast(res.message, 'error'); return; }
      const t = A.d.meta.turbo || {}; t.h = res.data.h; t.cur = res.data.h; t.at = res.data.at; t.err = '';
      A.d.meta.turbo = t; persist(); renderPengaturan();
      toast(res.message, 'success');
    }).catch(() => busyBtn('publish-now', false));
  }

  // ════════════════════════════════════════════════════════
  // BAGIAN 12: MODAL, SHEET, LOGOUT, REFRESH
  // ════════════════════════════════════════════════════════
  let modalReturn = null;
  function openModal(sel) { modalReturn = document.activeElement; $(sel).classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeModal(sel) {
    const m = $(sel); if (!m || !m.classList.contains('open')) return;
    m.classList.remove('open');
    if (!$('.amodal.open')) document.body.style.overflow = '';
    if (modalReturn && modalReturn.focus && document.body.contains(modalReturn)) modalReturn.focus();
  }
  function closeAllModals() { if (A.confirmDone) A.confirmDone(false); closeModal('#formModal'); closeSheet(); }

  function confirmBox(o) {
    return new Promise((resolve) => {
      const tone = o.tone || 'danger';
      $('#cfTitle').textContent = o.title || 'Yakin?';
      $('#cfMsg').textContent = o.msg || '';
      $('#cfIcon').className = 'confirm-ic' + (tone === 'info' ? ' info' : tone === 'warn' ? ' warn' : '');
      $('#cfIcon').innerHTML = `<i class="bi bi-${o.icon || (tone === 'danger' ? 'trash3' : 'question-circle')}" aria-hidden="true"></i>`;
      const yes = $('#cfYes');
      yes.textContent = o.ok || 'Ya';
      yes.className = 'btn ' + (tone === 'danger' ? 'btn-danger' : tone === 'warn' ? 'btn-yellow' : 'btn-primary');
      openModal('#confirmModal');
      setTimeout(() => $('#cfNo').focus(), 60);
      const done = (v) => { A.confirmDone = null; yes.onclick = null; $('#cfNo').onclick = null; closeModal('#confirmModal'); resolve(v); };
      A.confirmDone = done;
      yes.onclick = () => done(true);
      $('#cfNo').onclick = () => done(false);
    });
  }

  function openSheet(kind) {
    const items = kind === 'konten'
      ? KONTEN.map((r) => [r, ROUTE[r].t, ROUTE[r].i])
      : [['pengaturan', 'Pengaturan', 'gear'], ['__site', 'Lihat Situs', 'box-arrow-up-right'], ['__refresh', 'Muat Ulang', 'arrow-clockwise'], ['keluar', 'Keluar', 'box-arrow-left']];
    const site = siteUrl();
    $('#sheetBody').innerHTML = `<h3>${kind === 'konten' ? 'Kelola konten' : 'Lainnya'}</h3><div class="sheet-grid">${items.map(([r, l, i]) =>
      r === '__site' ? `<a href="${esc(site)}" target="_blank" rel="noopener" style="border:1px solid var(--line);border-radius:16px;min-height:84px;display:grid;justify-items:center;align-content:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--navy)"><i class="bi bi-${i}" style="font-size:22px;color:var(--primary)"></i>${l}</a>`
        : `<button type="button" ${r === '__refresh' ? 'data-act="refresh"' : `data-route="${r}"`} class="${r === 'keluar' ? 'danger' : ''}"><i class="bi bi-${i}" aria-hidden="true"></i>${l}</button>`).join('')}</div>`;
    $('#sheet').classList.add('open'); $('#sheetBack').classList.add('open');
  }
  function closeSheet() { const s = $('#sheet'); if (s) s.classList.remove('open'); const b = $('#sheetBack'); if (b) b.classList.remove('open'); }

  function confirmLogout() {
    if (A.pending > 0) { toast('Tunggu sebentar, masih ada perubahan yang sedang disinkronkan.', 'warning'); return; }
    confirmBox({ title: 'Keluar dari dashboard?', msg: 'Sesi admin di perangkat ini akan dihapus.', ok: 'Keluar', tone: 'info', icon: 'box-arrow-left' }).then((yes) => {
      if (!yes) return;
      P.api('logout', {}, { token: A.token, tries: 1 });
      clearSession(); destroyCharts();
      screen('admOut');
    });
  }

  let refreshing = false;
  function refresh(silent) {
    if (refreshing || !A.token) return;
    refreshing = true;
    const before = A.d ? A.d.pesan.length : 0;
    const btn = $('#btnRefresh'); if (btn) btn.classList.add('is-loading');
    call('adminRefresh').then((res) => {
      if (!res.success) throw new Error(res.message);
      if (A.pending > 0) return;
      A.d = normalize(res.data); A.lastFetch = Date.now(); persist();
      if (!A.ui.setDirty) A.ui.set = null;
      if (!A.ui.profDirty) A.ui.prof = null;
      renderShell();
      if (!((A.route === 'pengaturan' && A.ui.setDirty) || (A.route === 'profil' && A.ui.profDirty))) RENDER[A.route]();
      const diff = A.d.pesan.length - before;
      if (diff > 0) toast(`${diff} pesan baru masuk.`, 'info', { action: 'Lihat', onAction: () => navigate('pesan') });
      else if (!silent) toast('Data sudah yang terbaru.', 'success');
    }).catch((err) => { if (!silent && !err.auth) toast(err.message || 'Gagal memuat ulang.', 'error'); })
      .finally(() => { refreshing = false; if (btn) btn.classList.remove('is-loading'); });
  }

  // ════════════════════════════════════════════════════════
  // BAGIAN 13: EVENT (delegasi tunggal → cepat & hemat memori)
  // ════════════════════════════════════════════════════════
  let qT = null;
  function bindStatic() {
    if (A.bound) return; A.bound = true;
    const root = $('#adm');

    root.addEventListener('click', (e) => {
      const t = e.target;
      const el = (s) => t.closest(s);
      if (el('[data-stop]')) return;
      if (el('[data-exit]')) { exitToSite(); return; }
      if (t.id === 'btnRetry' || el('#btnRetry')) { try { window.google.accounts.id.disableAutoSelect(); } catch (x) { /* abaikan */ } showLogin('Pilih akun Google admin di halaman verifikasi Google (tautan "akun ke-2" bila punya beberapa akun), atau masuk dengan kata sandi.', 'info'); return; }
      if (el('#btnLoginAgain')) { showLogin(); return; }
      if (el('#btnSsoLogin')) { ssoLogin(); return; }
      if (el('#btnRefresh')) { refresh(false); return; }
      if (t.id === 'sheetBack') { closeSheet(); return; }
      if (t.classList.contains('amodal')) { if (t.id === 'confirmModal' && A.confirmDone) A.confirmDone(false); else closeModal('#' + t.id); return; }
      if (el('#formModal [data-close]')) { closeModal('#formModal'); return; }
      const sh = el('[data-sheet]'); if (sh) { openSheet(sh.getAttribute('data-sheet')); return; }
      const rt = el('[data-route]'); if (rt) { navigate(rt.getAttribute('data-route')); return; }
      const om = el('[data-open-msg]'); if (om && !el('.cbx')) { openMessage(om.getAttribute('data-open-msg')); return; }
      const hr = el('[data-home-range]'); if (hr) { A.ui.home = parseInt(hr.getAttribute('data-home-range'), 10) || 30; renderBeranda(); return; }
      const add = el('[data-add]'); if (add) { openForm(add.getAttribute('data-add')); return; }
      const tab = el('[data-tab]'); if (tab) { const [r, k] = tab.getAttribute('data-tab').split(':'); crudState(r).tab = k; renderCrud(r); return; }
      const st = el('[data-stab]'); if (st) { A.ui.stat.tab = st.getAttribute('data-stab'); A.ui.stat.page = 0; renderStatistik(); return; }
      const pg = el('[data-page]'); if (pg) {
        const [k, n] = pg.getAttribute('data-page').split(':');
        if (k === 'pesan') { A.ui.pesan.page = +n; renderPesanList(); } else { A.ui.stat.page = +n; renderStatTable(); }
        return;
      }
      const row = el('[data-row]');
      if (row) {
        const route = row.getAttribute('data-row'); const id = row.getAttribute('data-id');
        const mv = el('[data-move]'); if (mv) { moveRow(route, id, parseInt(mv.getAttribute('data-move'), 10)); return; }
        if (el('[data-edit]')) { const r = A.d[CRUD[route].key].find((x) => x.id === id); if (r) openForm(route, r); return; }
        if (el('[data-del]')) { deleteRow(route, id); return; }
      }
      const star = el('[data-star]'); if (star) {
        const n = +star.getAttribute('data-star'); const box = star.parentElement;
        box.previousElementSibling.value = n;
        $$('[data-star]', box).forEach((b) => { const i = +b.getAttribute('data-star'); b.classList.toggle('on', i <= n); b.setAttribute('aria-checked', String(i === n)); });
        return;
      }
      const ic = el('[data-icon]'); if (ic) {
        const box = ic.parentElement; const v = ic.getAttribute('data-icon');
        box.previousElementSibling.value = v;
        $$('[data-icon]', box).forEach((b) => { const on = b === ic; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
        const cu = box.nextElementSibling; if (cu) cu.value = '';
        return;
      }
      const clr = el('[data-clear-img]'); if (clr) {
        const id = clr.getAttribute('data-clear-img');
        delete A.uploads[id];
        const inp = $(`[data-urlin="${id}"]`); if (inp) inp.value = '';
        upPreview(id, ''); upState(id, 'idle');
        if (id === 'prof_foto' && A.ui.prof) { A.ui.prof.url_foto = ''; markProfDirty(); }
        return;
      }
      const sw = el('[data-swatch]'); if (sw) { A.ui.set.warna_utama = sw.getAttribute('data-swatch'); P.applyTheme(A.ui.set); markSetDirty(); renderPengaturan(); return; }
      const act = el('[data-act]'); if (act) { doAct(act.getAttribute('data-act'), act); }
    });

    root.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open-msg]')) { e.preventDefault(); openMessage(e.target.getAttribute('data-open-msg')); }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('label.btn[tabindex]')) { e.preventDefault(); const f = $('input[type=file]', e.target); if (f) f.click(); }
    });

    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.matches('[data-crud-q]')) { const r = t.getAttribute('data-crud-q'); crudState(r).q = t.value; clearTimeout(qT); qT = setTimeout(() => renderCrudRows(r), 150); return; }
      if (t.matches('[data-pq]')) { A.ui.pesan.q = t.value; A.ui.pesan.page = 0; clearTimeout(qT); qT = setTimeout(renderPesanList, 150); return; }
      if (t.matches('[data-sfilter="q"]')) { A.ui.stat.q = t.value; A.ui.stat.page = 0; clearTimeout(qT); qT = setTimeout(renderStatTable, 150); return; }
      if (t.matches('[data-range-out]')) { t.nextElementSibling.value = t.value + '%'; return; }
      if (t.matches('[data-icon-custom]')) {
        const v = icon(t.value); const hid = t.previousElementSibling.previousElementSibling;
        if (t.value.trim()) { hid.value = v; $$('[data-icon]', t.previousElementSibling).forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-checked', 'false'); }); }
        return;
      }
      if (t.matches('[data-prof]')) {
        A.ui.prof[t.getAttribute('data-prof')] = t.value; markProfDirty();
        if (t.getAttribute('data-prof') === 'headline') $('#headPrev').innerHTML = P.accent(t.value, false);
        showErr(t.closest('.field'), '');
        return;
      }
      if (t.matches('[data-urlin="prof_foto"]')) { A.ui.prof.url_foto = t.value.trim(); upPreview('prof_foto', isHttps(t.value) ? t.value.trim() : ''); markProfDirty(); return; }
      if (t.matches('[data-urlin]')) { upPreview(t.getAttribute('data-urlin'), isHttps(t.value) ? t.value.trim() : ''); return; }
      if (t.matches('[data-set]') && t.type !== 'checkbox') {
        const k = t.getAttribute('data-set'); A.ui.set[k] = t.value; markSetDirty();
        const c = $(`[data-count="${k}"]`); if (c) c.textContent = t.value.length;
        showErr(t.closest('.field'), '');
        return;
      }
      if (t.matches('[data-set-color]')) { A.ui.set.warna_utama = t.value.toUpperCase(); P.applyTheme(A.ui.set); markSetDirty(); return; }
      const fld = t.closest('#formBody .field'); if (fld) showErr(fld, '');
    });

    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-toggle]')) { const row = t.closest('[data-row]'); toggleRow(row.getAttribute('data-row'), row.getAttribute('data-id'), t.checked); return; }
      if (t.matches('[data-crud-cat]')) { const r = t.getAttribute('data-crud-cat'); crudState(r).cat = t.value; renderCrudRows(r); return; }
      if (t.matches('[data-pstatus]')) { A.ui.pesan.status = t.value; A.ui.pesan.page = 0; renderPesanList(); return; }
      if (t.matches('[data-prange]')) { A.ui.pesan.range = t.value; A.ui.pesan.page = 0; renderPesanList(); return; }
      if (t.matches('[data-psel]')) { const id = t.getAttribute('data-psel'); if (t.checked) A.ui.pesan.sel.add(id); else A.ui.pesan.sel.delete(id); renderBulk(); return; }
      if (t.matches('[data-psel-all]')) {
        const st = A.ui.pesan; const list = pesanFiltered().slice(st.page * PAGE_MSG, st.page * PAGE_MSG + PAGE_MSG);
        list.forEach((m) => { if (t.checked) st.sel.add(m.id); else st.sel.delete(m.id); });
        renderPesanList(); return;
      }
      if (t.matches('[data-sfilter]')) {
        const k = t.getAttribute('data-sfilter'); if (k === 'q') return;
        A.ui.stat[k] = t.value; A.ui.stat.page = 0;
        if (k === 'type') renderStatTable(); else renderStatistik();
        return;
      }
      if (t.matches('[data-set]') && t.type === 'checkbox') { A.ui.set[t.getAttribute('data-set')] = t.checked; markSetDirty(); return; }
      if (t.matches('[data-set-color]')) { renderPengaturan(); return; }
      if (t.matches('[data-file]')) { const f = t.files && t.files[0]; if (f) startUpload(t.getAttribute('data-file'), f).catch(() => {}); t.value = ''; return; }
    });

    // Seret & lepas gambar
    root.addEventListener('dragover', (e) => { const u = e.target.closest('.uploader'); if (u) { e.preventDefault(); u.classList.add('drag'); } });
    root.addEventListener('dragleave', (e) => { const u = e.target.closest('.uploader'); if (u) u.classList.remove('drag'); });
    root.addEventListener('drop', (e) => {
      const u = e.target.closest('.uploader'); if (!u) return;
      e.preventDefault(); u.classList.remove('drag');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) startUpload(u.getAttribute('data-up'), f).catch(() => {});
    });

    $('#crudForm').addEventListener('submit', submitCrud);
    $('#pwForm').addEventListener('submit', passwordLogin);

    document.addEventListener('keydown', (e) => {
      if ($('#admApp').hidden) return;
      if (e.key === 'Escape') {
        if (A.confirmDone) { A.confirmDone(false); return; }
        if ($('#formModal').classList.contains('open')) { closeModal('#formModal'); return; }
        if ($('#sheet').classList.contains('open')) { closeSheet(); return; }
        const d = $('#pesanDetail.show'); if (d) { d.classList.remove('show'); return; }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        if (A.route === 'pengaturan' && A.ui.setDirty) { e.preventDefault(); saveSettings(); }
        else if (A.route === 'profil' && A.ui.profDirty) { e.preventDefault(); saveProfil(); }
      }
    });

    // Tarik pesan baru otomatis saat tab kembali aktif (maks. tiap 2 menit)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && A.d && A.token && Date.now() - A.lastFetch > 120000 && !$('.amodal.open')) refresh(true);
    });
  }

  function doAct(a, el) {
    switch (a) {
      case 'new-proj': navigate('portofolio'); openForm('portofolio'); break;
      case 'save-prof': saveProfil(); break;
      case 'cancel-prof': A.ui.prof = Object.assign({}, A.d.profil); A.ui.profDirty = false; delete A.uploads.prof_foto; renderProfil(); break;
      case 'save-set': saveSettings(); break;
      case 'cancel-set': A.ui.set = Object.assign({}, A.d.settings); A.ui.setDirty = false; P.applyTheme(A.d.settings); renderPengaturan(); break;
      case 'toggle-url': A.ui.showUrl = !A.ui.showUrl; renderPengaturan(); break;
      case 'copy-url': copyText(adminUrl(), $('#admUrl')); break;
      case 'copy-api': copyText(P.GAS_URL); break;
      case 'save-pw': savePassword(); break;
      case 'remove-pw': removePassword(); break;
      case 'logout-all': logoutAll(); break;
      case 'publish-now': publishNow(); break;
      case 'regen-key': regenKey(); break;
      case 'export-xlsx': exportExcel(false); break;
      case 'export-pdf': exportPdf(); break;
      case 'export-pesan': exportExcel(true); break;
      case 'refresh': closeSheet(); refresh(false); break;
      case 'close-msg': { const d = $('#pesanDetail'); if (d) d.classList.remove('show'); break; }
      case 'msg-toggle': { const id = el.getAttribute('data-id'); const m = A.d.pesan.find((x) => x.id === id); if (m) setStatus([id], m.status === 'baru' ? 'dibaca' : 'baru'); break; }
      case 'msg-del': deleteMessages([el.getAttribute('data-id')]); break;
      case 'bulk-read': setStatus(Array.from(A.ui.pesan.sel), 'dibaca'); A.ui.pesan.sel.clear(); renderPesanList(); break;
      case 'bulk-unread': setStatus(Array.from(A.ui.pesan.sel), 'baru'); A.ui.pesan.sel.clear(); renderPesanList(); break;
      case 'bulk-del': deleteMessages(Array.from(A.ui.pesan.sel)); break;
      case 'bulk-clear': A.ui.pesan.sel.clear(); renderPesanList(); break;
      default: break;
    }
  }

  const RENDER = {
    beranda: renderBeranda,
    profil: renderProfil,
    tentang: () => renderCrud('tentang'),
    keahlian: () => renderCrud('keahlian'),
    portofolio: () => renderCrud('portofolio'),
    testimoni: () => renderCrud('testimoni'),
    kontak: () => renderCrud('kontak'),
    pesan: renderPesan,
    statistik: renderStatistik,
    pengaturan: renderPengaturan
  };

  window.AdminApp = { state: A };
  start();
})();
