# Panduan Instalasi — Portofolio (GitHub Pages + Google Apps Script)

Arsitektur: **frontend** (folder ini) tayang di GitHub Pages, **backend** (`Kode.gs`) tetap di Google Apps Script + Google Sheets. Data lama Anda aman: spreadsheet dan Script Properties dipakai apa adanya.

Kerjakan berurutan. Kirim screenshot jika ada langkah yang tidak sesuai.

---

## 1. Perbarui backend (Apps Script)

1. Buka proyek Apps Script Anda.
2. Buka `Kode.gs` → **hapus semua isinya** → tempel isi file `Kode.gs` yang baru (dikirim terpisah).
3. Hapus file lama: `Index`, `Stylesheet`, `JavaScript`, `Admin`, `AdminJs` (klik ⋮ → Remove). Tidak dipakai lagi.
4. Pilih fungsi **`setupAppEnvironment`** → **Run**. Aman diulang; data tidak ditimpa.
5. **Deploy → Manage deployments → ikon pensil (Edit) → Version: New version → Deploy.**
   Pengaturan: *Execute as: Me*, *Who has access: Anyone*. URL `/exec` **tidak berubah**.
6. Salin URL `/exec` (diperlukan di langkah 2).

## 2. Isi alamat server di frontend

Buka `js/config.js` dan ganti `XXXX` dengan URL `/exec` Anda:

```js
GAS_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
```

## 3. Siapkan GitHub (sekali saja)

1. Daftar di https://github.com (username Anda menjadi bagian alamat situs).
2. Pasang Git: https://git-scm.com/download/win (Windows, pengaturan bawaan).
3. Buka PowerShell, jalankan:
   ```
   git config --global user.name "Nama Anda"
   git config --global user.email "email-akun-github@anda.com"
   ```
4. Di github.com: **+ → New repository** → beri nama (mis. `portofolio`) → **Public** → **jangan** centang README/.gitignore/license → **Create**.
5. Buat token: https://github.com/settings/tokens → **Generate new token (classic)** → centang **repo** → Generate → **salin token** (`ghp_...`, hanya tampil sekali).

## 4. Unggah frontend (lewat terminal, bukan Upload di web)

Ekstrak ZIP. Folder hasil ekstraksi **itulah** folder kerja Anda: di dalamnya harus langsung terlihat `index.html`, `admin.html`, folder `css`, `js`, `fonts`.

Tip Windows: buka folder itu di File Explorer, klik address bar, ketik `powershell`, Enter.

Pastikan benar:
```
dir
```
`index.html` harus muncul di daftar. Jika yang terlihat hanya satu folder lagi, masuklah ke folder itu dulu.

Lalu jalankan satu per satu:
```
git init
git add .
git commit -m "Upload pertama"
```
```
git branch -M main
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git push -u origin main
```
Saat diminta *Username*: username GitHub. *Password*: **tempel token** (layar tampak kosong saat mengetik/paste; itu normal), Enter.

## 5. Aktifkan GitHub Pages

Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch **main** / **(root)** → **Save**. Centang **Enforce HTTPS**. Tunggu 1–2 menit; alamat situs muncul:

`https://USERNAME.github.io/NAMA-REPO/`

## 6. Masuk dashboard admin

Alamat admin:

`https://USERNAME.github.io/NAMA-REPO/admin.html#k=ALAMAT_RAHASIA`

Cara melihat `ALAMAT_RAHASIA`: di Apps Script jalankan **`lihatAlamatAdmin`** → buka *Execution log*.

Klik **Masuk dengan Akun Google**. Anda dibawa sebentar ke halaman verifikasi Google, klik **Lanjutkan ke Dashboard**. Tidak perlu OAuth Client ID. Simpan alamat admin di bookmark.

Kata sandi cadangan (opsional): Apps Script → Project Settings → Script Properties → tambah `ADMIN_PASSWORD` (min. 8 karakter). Otomatis di-hash lalu teks aslinya dihapus. Atau atur dari dashboard: Pengaturan → Keamanan.

> Karena kunci admin pernah dibagikan di chat, ganti sekarang: Dashboard → Pengaturan → **Ganti Alamat Rahasia**.

## 7. Mode Turbo (opsional, makin cepat untuk pengunjung pertama)

Konten publik disalin ke GitHub otomatis, jadi pengunjung pertama tidak menunggu server Google.

1. Buat token fine-grained: https://github.com/settings/personal-access-tokens/new → Repository access: *Only select repositories* → repo situs → Permissions → **Contents: Read and write**.
2. Apps Script → Script Properties, tambah:
   - `GITHUB_TOKEN` = token tadi
   - `GITHUB_REPO` = `USERNAME/NAMA-REPO`
3. Jalankan fungsi **`aktifkanTurbo`**. Data masuk ke cabang `turbo-data` (cabang `main` tidak disentuh), dan pembaruan otomatis tiap 5 menit.
4. Di `js/config.js` ubah `TURBO: false` menjadi `TURBO: true`, lalu update (bagian 8).

Matikan: jalankan `matikanTurbo` dan set `TURBO: false`.

## 8. Memperbarui situs

Edit file → di folder kerja:
```
git add .
git commit -m "Perubahan"
git push
```
Tunggu 1–2 menit, lalu **Ctrl+Shift+R**. Konten (teks, proyek, foto) diubah dari dashboard dan **tidak** perlu push.

## 9. Memeriksa kecepatan

Buka situs → F12 → Console → ketik `PF.Perf.table()`. Kolom `server` = waktu kerja Apps Script, `net` = jaringan + cold start.

## Masalah umum

| Gejala | Solusi |
|---|---|
| 404 di situs | `index.html` tidak di root repo. Ulangi bagian 4 dari folder yang benar (`git push -u origin main --force`). |
| Tanpa gaya / CSS tidak termuat | Folder `css`, `js`, `fonts` tidak ikut ter-push. Jangan pakai Upload di web. |
| "Situs belum dikonfigurasi" | `GAS_URL` di `js/config.js` belum diisi. |
| "Server mengirim halaman, bukan data" | Deployment belum *Anyone* atau belum *New version*. Ulangi bagian 1 langkah 5. |
| "Alamat admin tidak valid" | Alamat rahasia sudah diganti. Jalankan `lihatAlamatAdmin`. |
| Google tidak mengenali akun admin | Di halaman verifikasi pilih tautan "akun ke-2", atau pakai kata sandi. |
| Situs lama masih tampil | Hard refresh Ctrl+Shift+R atau jendela Incognito. |
