# MUHIBA MOTOR SERVICE (Cloudflare)

Aplikasi servis motor SMK Muhammadiyah Bawang: pendaftaran, cek status, dan panel admin.
Berjalan penuh di Cloudflare: **Worker** (API) + **D1** (database) + **KV** (sesi login) + halaman statis.

## Deploy lewat terminal (sekali saja)

Butuh Node.js 18+ dan akun Cloudflare gratis.

1. `npm install`
2. `npx wrangler login`
3. Buat database: `npx wrangler d1 create muhiba-db`
   Salin `database_id` dari hasilnya ke `wrangler.toml` (ganti `ISI_DATABASE_ID_D1`).
4. Buat KV: `npx wrangler kv namespace create KV`
   Salin `id` dari hasilnya ke `wrangler.toml` (ganti `ISI_ID_KV`).
5. Buat tabel: `npm run db:init`
6. Password admin awal: `npx wrangler secret put ADMIN_PASS` (min. 10 karakter).
   Username awal ada di `wrangler.toml` (`ADMIN_USER`, bawaan `admin`).
7. Isi nomor WhatsApp bengkel di `public/config.js`.
8. `npm run deploy`

Alamat aplikasi muncul di akhir deploy: `https://muhiba-motor-service.<akun>.workers.dev`.

## Deploy lewat GitHub (Workers Builds)

1. Unggah folder ini ke repositori GitHub.
2. Cloudflare Dashboard > Workers & Pages > Create > Import a repository.
3. Buat D1 dan KV di dashboard (Storage & Databases), lalu isi ID-nya di `wrangler.toml`.
4. Jalankan skema sekali: di D1 > muhiba-db > Console, tempel isi `schema.sql`.
5. Di Worker > Settings > Variables and Secrets, tambah secret `ADMIN_PASS`.

## Cara pakai

- Pelanggan: buka alamat utama. Admin: tautan kecil "Admin" di paling bawah halaman, atau tambahkan `?admin=1` di alamat.
- Login admin pertama memakai `ADMIN_USER` dan `ADMIN_PASS`. Setelah itu password disimpan sebagai hash di database dan bisa diganti lewat tombol **Ganti Password**.
- 5 kali salah login mengunci akun 3 jam. Untuk membuka kunci langsung, hapus kunci di KV (`K` + username) lewat dashboard.
- Lupa password: `npx wrangler d1 execute muhiba-db --remote --command "DELETE FROM pengaturan"`, lalu login lagi dengan `ADMIN_USER` dan `ADMIN_PASS` (secret).
- QR di panel admin berisi alamat halaman + token motor. Domain sendiri bisa dipasang di Worker > Settings > Domains & Routes.

## Uji lokal

1. Salin `.dev.vars.example` menjadi `.dev.vars` dan isi.
2. `npm run db:init:local` lalu `npm run dev`.

## Impor data lama dari Google Sheets (opsional)

Ekspor sheet SERVIS dan RIWAYAT ke CSV, lalu impor lewat D1 Console atau `wrangler d1 execute` dengan `INSERT`. Nama kolom sama dengan di `schema.sql`.

## Struktur

- `src/index.js` : API Worker
- `public/index.html` : tampilan pelanggan dan admin
- `public/config.js` : nomor WhatsApp
- `schema.sql` : skema D1
- `wrangler.toml` : konfigurasi Cloudflare
