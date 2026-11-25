# Pembaruan v2.1: Portofolio

Fitur baru di halaman publik:

1. **Thumbnail proyek landscape 16:9.** Gunakan gambar 1600×900 px agar pas.
2. **Popup proyek.** Klik gambar proyek untuk membuka gambar penuh, deskripsi, teknologi, dan tombol CTA yang menyala ("View Project" / "Discuss This Project").
3. **Testimoni interaktif.**
   - Kartu terangkat saat disorot. Klik kartu untuk membaca teks lengkap di popup.
   - Jika ada lebih dari 4 testimoni, kartu berganti satu per satu dengan efek flip setiap ±4,5 detik.
   - Pergantian berhenti saat kursor berada di atas kartu.
4. **Musik latar dari YouTube.**
   - Isi di Dashboard → Pengaturan → Musik Latar & Animasi.
   - Musik mulai setelah klik pertama pengunjung (aturan browser).
   - Pemutar mini 200×200 tampil di kanan bawah (aturan YouTube: pemutar tidak boleh disembunyikan). Iklan tidak diblokir.
   - Pengunjung bisa mematikan suara atau menyembunyikan pemutar, dan musik ikut berhenti.
   - Di HP, musik tidak muncul otomatis. Yang tampil adalah tombol "Play music" yang menyala.
5. **Lebah interaktif.** Lebah mengikuti kursor dan menghampiri saat kursor berhenti. Hanya di komputer, dan bisa dimatikan di Pengaturan.

Permintaan yang **tidak** diterapkan karena bagiannya tidak ada di paket Portofolio: tulisan diskon menyala, slideshow "Bukti Nyata Member", dan perbaikan popup formulir email/WA.

## Cara memasang

### 1. Backend
1. Buka Apps Script, lalu ganti seluruh isi `Kode.gs` dengan berkas baru.
2. Pilih Deploy → Manage deployments → Edit (ikon pensil) → Version: **New version** → Deploy.

URL `/exec` tidak berubah dan data tetap aman.

### 2. Frontend
Salin isi ZIP ke folder proyek Anda dan timpa berkas yang sama. **`js/config.js` sengaja tidak disertakan** supaya `GAS_URL` Anda tidak tertimpa.

Berkas yang berubah:
- `index.html`
- `css/style.css`
- `js/app.js`, `js/core.js`, `js/admin.js`
- `fonts/bi.woff2`

Lalu jalankan di folder proyek:
```
git add .
git commit -m "Upgrade v2.1"
git push
```
Tunggu 1–2 menit, lalu tekan **Ctrl+Shift+R**.

### 3. Atur musik
Buka Dashboard → Pengaturan → **Musik Latar & Animasi**, tempel tautan video YouTube (contoh `https://youtu.be/xxxxxxxxxxx`), lalu klik **Simpan**.
