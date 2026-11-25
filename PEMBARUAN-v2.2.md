# Pembaruan v2.2: Aplikasi Bisa Diinstal di HP (PWA)

Situs portofolio dan dashboard admin kini bisa dipasang seperti aplikasi: ada ikon di layar utama, terbuka tanpa bilah alamat browser, dan tetap tampil saat offline dengan data terakhir.

Ada dua aplikasi terpisah:
- **Portofolio**, untuk pengunjung. Dipasang dari halaman utama.
- **Admin**, untuk Anda. Dipasang dari `admin.html`, dan ikonnya punya tanda bulat kuning.

## Cara memasang pembaruan

1. Salin isi ZIP ke folder proyek Anda dan timpa berkas yang sama.
   `js/config.js` sengaja tidak disertakan supaya `GAS_URL` Anda tidak tertimpa.
2. Berkas baru dan yang berubah:
   - baru: `manifest.webmanifest`, `manifest-admin.webmanifest`, `sw.js`, folder `icons/`
   - berubah: `index.html`, `admin.html`, `css/style.css`, `js/core.js`, `js/admin.js`, `fonts/bi.woff2`
3. Jalankan di folder proyek:
   ```
   git add .
   git commit -m "PWA v2.2"
   git push
   ```
4. Tunggu 1–2 menit, buka situs, lalu tekan Ctrl+Shift+R.

Backend (`Kode.gs`) **tidak berubah**, jadi tidak perlu deploy ulang.

## Cara menginstal di HP

**Android (Chrome):** buka situs, lalu ketuk tombol **Install App** yang muncul di kiri bawah. Bisa juga lewat menu ⋮ → **Instal aplikasi** / **Tambahkan ke layar utama**.

**iPhone / iPad (Safari):** ketuk **Install App**, lalu ikuti panduan: tombol Bagikan → **Add to Home Screen** → **Add**.

**Dashboard admin:** buka alamat admin Anda (`.../admin.html#k=...`) di HP, lalu ketuk **Pasang Aplikasi**.

Catatan:
- Tombol install hanya muncul jika situs dibuka lewat **https** (GitHub Pages sudah https) dan aplikasi belum terpasang. Jika pengunjung menekan ✕, tombol disembunyikan selama 7 hari.
- **iPhone, aplikasi Admin:** login dengan akun Google membuka Safari, dan aplikasi terpasang di iPhone tidak berbagi sesi dengan Safari. Di aplikasi Admin iPhone, gunakan **Masuk dengan kata sandi**. Di Android, login Google bekerja normal: setelah selesai di tab Google, aplikasi otomatis masuk.
- **Pembaruan berikutnya:** setelah Anda push perubahan, aplikasi menampilkan "Versi baru tersedia → Muat ulang". Untuk perubahan besar, naikkan `VERSION` di baris atas `sw.js` (mis. `pf-v2.2.1`).
- Perubahan konten lewat dashboard (teks, proyek, foto) tetap langsung tampil, tanpa push.
