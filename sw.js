/**
 * Service Worker — membuat situs bisa diinstal di HP dan terbuka instan/offline.
 * - Halaman (index.html, admin.html) & js/config.js: ambil dari jaringan dulu,
 *   pakai salinan tersimpan bila offline → perubahan Anda langsung terlihat.
 * - CSS, JS, font, ikon: tampil dari salinan tersimpan, diperbarui diam-diam di latar.
 * - Permintaan ke Google Apps Script, YouTube, gambar Drive, dsb. TIDAK disentuh.
 * Naikkan VERSION setiap merilis pembaruan besar agar salinan lama dibuang.
 */
const VERSION = 'pf-v2.2.0';
const SHELL = [
  './', './index.html', './admin.html',
  './css/style.css', './css/admin.css',
  './js/config.js', './js/core.js', './js/app.js', './js/admin.js',
  './fonts/pjs-400.woff2', './fonts/pjs-600.woff2', './fonts/pjs-700.woff2', './fonts/pjs-800.woff2',
  './fonts/caveat-700.woff2', './fonts/bi.woff2',
  './manifest.webmanifest', './manifest-admin.webmanifest',
  './icons/icon-192.png', './icons/admin-192.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.indexOf('pf-') === 0 && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function networkFirst(req, key) {
  return fetch(req).then((res) => {
    if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(key || req, copy)); }
    return res;
  }).catch(() => caches.match(key || req, { ignoreSearch: true })
    .then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
}

function staleWhileRevalidate(req) {
  return caches.open(VERSION).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => {
    const net = fetch(req).then((res) => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // GAS, YouTube, Drive, CDN: biarkan browser
  if (req.mode === 'navigate') {
    // Simpan per halaman tanpa query/hash (?source=pwa, #k=… tidak membuat salinan baru)
    const page = url.pathname.endsWith('admin.html') ? './admin.html' : './index.html';
    e.respondWith(networkFirst(req, page));
    return;
  }
  if (url.pathname.endsWith('/js/config.js')) { e.respondWith(networkFirst(req)); return; }
  e.respondWith(staleWhileRevalidate(req));
});
