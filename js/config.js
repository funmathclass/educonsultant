/**
 * ============================================================
 * KONFIGURASI — WAJIB diisi sebelum di-push ke GitHub
 * ============================================================
 * GAS_URL : URL Web App dari Apps Script (Deploy → Manage deployments),
 *           diakhiri /exec. Contoh:
 *           https://script.google.com/macros/s/AKfycbx.../exec
 *
 * TURBO   : (opsional) Mode Turbo — data dibaca dari CDN GitHub sehingga
 *           pengunjung pertama tidak menunggu server Google.
 *           false = mati (bawaan)
 *           true  = alamat snapshot dihitung otomatis dari alamat github.io
 *           'https://raw.githubusercontent.com/USER/REPO/turbo-data/content.json'
 *                 = alamat lengkap (wajib jika memakai domain sendiri)
 *           Aktifkan dulu di Apps Script (lihat PANDUAN-INSTALASI.md bagian 7).
 * ============================================================
 */
window.PF_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyMPOEVnFRMlX4G0i2NMoVtZKUrhMy9C5GpbeHpZSHzPh5HCerK2NDx7wa8XCZMirju/exec',
  TURBO: false
};
