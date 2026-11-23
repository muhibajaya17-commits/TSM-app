-- MUHIBA MOTOR SERVICE - skema database D1
CREATE TABLE IF NOT EXISTS servis (
  id_servis        TEXT PRIMARY KEY,
  nomor_registrasi TEXT NOT NULL UNIQUE,
  tanggal_daftar   TEXT NOT NULL,
  nama_pemilik     TEXT NOT NULL,
  plat_nomor       TEXT NOT NULL,
  nomor_rangka     TEXT NOT NULL,
  jenis_motor      TEXT NOT NULL,
  tahun_pembuatan  TEXT NOT NULL,
  jenis_layanan    TEXT NOT NULL,
  nomor_whatsapp   TEXT NOT NULL,
  alamat           TEXT NOT NULL,
  status_servis    TEXT NOT NULL DEFAULT 'Menunggu',
  catatan_teknisi  TEXT NOT NULL DEFAULT '',
  token_qr         TEXT NOT NULL UNIQUE,
  tanggal_update   TEXT NOT NULL DEFAULT '',
  tanggal_selesai  TEXT NOT NULL DEFAULT '',
  tanggal_diambil  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_servis_status ON servis(status_servis);

CREATE TABLE IF NOT EXISTS riwayat (
  id_riwayat        TEXT PRIMARY KEY,
  id_servis         TEXT NOT NULL,
  nomor_registrasi  TEXT NOT NULL,
  status_sebelumnya TEXT NOT NULL DEFAULT '',
  status_baru       TEXT NOT NULL,
  catatan           TEXT NOT NULL DEFAULT '',
  admin             TEXT NOT NULL DEFAULT '',
  tanggal_perubahan TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_riwayat_servis ON riwayat(id_servis);

CREATE TABLE IF NOT EXISTS pengaturan (
  kunci TEXT PRIMARY KEY,
  nilai TEXT NOT NULL
);
