// MUHIBA MOTOR SERVICE - backend (Cloudflare Worker + D1 + KV) | developed by @hndx07
// Semua aksi lewat POST /api dengan body JSON {action, token, ...}. Bentuk respons sama dengan versi Apps Script.

const TZ = 'Asia/Jakarta';
const ST = ['Menunggu', 'Pemeriksaan', 'Sedang Dikerjakan', 'Selesai', 'Sudah Diambil'];
const LY = ['Servis + Ganti Oli', 'Servis Saja'];
const MAX_LOGIN = 5;
const LOCK_SEC = 10800; // 3 jam
const SESSION_SEC = 21600; // 6 jam
const enc = new TextEncoder();

class HttpError extends Error {
  constructor(message, auth = false) {
    super(message);
    this.auth = auth;
  }
}

/* ===== Utilities ===== */
const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
function nowParts() {
  const p = {};
  for (const x of fmt.formatToParts(new Date())) p[x.type] = x.value;
  return p;
}
const now = () => { const p = nowParts(); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`; };
const dateKey = () => { const p = nowParts(); return `${p.year}${p.month}${p.day}`; };
const thisYear = () => +nowParts().year;

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max);
}
function normWA(v) {
  v = String(v || '').replace(/\D/g, '');
  if (v.startsWith('0')) v = '62' + v.slice(1);
  else if (v.startsWith('8')) v = '62' + v;
  return /^628\d{8,12}$/.test(v) ? v : '';
}
const newToken = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hash(pw, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return hex(bits);
}
function same(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

/* ===== Pengaturan (admin) ===== */
async function getSetting(env, k) {
  const r = await env.DB.prepare('SELECT nilai FROM pengaturan WHERE kunci=?').bind(k).first();
  return r ? r.nilai : '';
}
async function setSettings(env, obj) {
  const stmts = Object.entries(obj).map(([k, v]) =>
    env.DB.prepare('INSERT INTO pengaturan(kunci,nilai) VALUES(?,?) ON CONFLICT(kunci) DO UPDATE SET nilai=excluded.nilai').bind(k, v));
  await env.DB.batch(stmts);
}
async function logH(env, s, from, to, cat, adm) {
  await env.DB.prepare(
    'INSERT INTO riwayat(id_riwayat,id_servis,nomor_registrasi,status_sebelumnya,status_baru,catatan,admin,tanggal_perubahan) VALUES(?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), s.id_servis, s.nomor_registrasi, from, to, cat, adm, now()).run();
}

/* ===== Publik ===== */
async function register(env, r) {
  const nama = clean(r.nama, 80), wa = normWA(r.wa), alamat = clean(r.alamat, 200);
  const plat = clean(r.plat, 12).toUpperCase(), rangka = clean(r.rangka, 25).toUpperCase();
  const motor = clean(r.motor, 50), tahun = String(r.tahun || '').trim();
  if (!nama || !alamat || !motor) throw new HttpError('Lengkapi semua data wajib.');
  if (!wa) throw new HttpError('Nomor WhatsApp tidak valid.');
  if (!/^[A-Z]{1,2} ?\d{1,4} ?[A-Z]{0,3}$/.test(plat)) throw new HttpError('Format plat nomor tidak valid.');
  if (!/^[A-Z0-9]{5,25}$/.test(rangka)) throw new HttpError('Nomor rangka tidak valid.');
  if (!/^\d{4}$/.test(tahun) || +tahun < 1980 || +tahun > thisYear() + 1) throw new HttpError('Tahun pembuatan tidak valid.');
  if (!LY.includes(r.layanan)) throw new HttpError('Pilih jenis layanan.');

  const k = 'R' + wa, n = +(await env.KV.get(k)) || 0;
  if (n >= 5) throw new HttpError('Terlalu banyak pendaftaran. Coba lagi nanti.');

  const dk = dateKey(), t = now(), id = crypto.randomUUID(), token = newToken();
  let done = false;
  for (let i = 0; i < 6 && !done; i++) {
    try {
      await env.DB.prepare(
        `INSERT INTO servis(id_servis,nomor_registrasi,tanggal_daftar,nama_pemilik,plat_nomor,nomor_rangka,jenis_motor,tahun_pembuatan,jenis_layanan,nomor_whatsapp,alamat,status_servis,catatan_teknisi,token_qr,tanggal_update)
         VALUES(?, 'TSM-'||?||'-'||printf('%03d',(SELECT COUNT(*) FROM servis WHERE nomor_registrasi LIKE ?)+1), ?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, dk, `TSM-${dk}-%`, t, nama, plat, rangka, motor, tahun, r.layanan, wa, alamat, ST[0], '', token, t).run();
      done = true;
    } catch (e) {
      if (!String(e && e.message).includes('UNIQUE') || i === 5) throw e;
    }
  }
  const s = await env.DB.prepare('SELECT id_servis,nomor_registrasi FROM servis WHERE id_servis=?').bind(id).first();
  await logH(env, s, '', ST[0], 'Pendaftaran masuk', 'sistem');
  await env.KV.put(k, String(n + 1), { expirationTtl: 3600 });
  return { ok: true, nomor_registrasi: s.nomor_registrasi, tanggal_daftar: t };
}

// pembatas sederhana per-IP (di memori isolate, upaya terbaik)
const hits = new Map();
function throttle(ip) {
  const t = Date.now(), h = hits.get(ip);
  if (!h || t - h.t > 60000) { hits.set(ip, { t, n: 1 }); if (hits.size > 5000) hits.clear(); return; }
  if (++h.n > 40) throw new HttpError('Terlalu banyak permintaan. Coba sesaat lagi.');
}
async function status(env, r, ip) {
  throttle(ip);
  const q = clean(r.q, 64);
  if (!q) throw new HttpError('Masukkan nomor registrasi.');
  const s = await env.DB.prepare('SELECT * FROM servis WHERE nomor_registrasi=? OR token_qr=?').bind(q.toUpperCase(), q).first();
  if (!s) throw new HttpError('Data tidak ditemukan.');
  const h = await env.DB.prepare('SELECT status_baru,catatan,tanggal_perubahan FROM riwayat WHERE id_servis=? ORDER BY rowid').bind(s.id_servis).all();
  return {
    ok: true,
    data: {
      nomor_registrasi: s.nomor_registrasi, nama_pemilik: s.nama_pemilik, jenis_motor: s.jenis_motor,
      plat_nomor: s.plat_nomor, jenis_layanan: s.jenis_layanan, tanggal_daftar: s.tanggal_daftar,
      status_servis: s.status_servis, catatan_teknisi: s.catatan_teknisi,
    },
    riwayat: h.results.map((x) => ({ status: x.status_baru, catatan: x.catatan, tanggal: x.tanggal_perubahan })),
  };
}

/* ===== Autentikasi ===== */
async function login(env, r) {
  const u = clean(r.user, 50).toLowerCase(), pw = String(r.pass || '').trim();
  if (await env.KV.get('K' + u)) throw new HttpError('Login dikunci karena 5 kali gagal. Coba lagi setelah 3 jam.');
  let ok = false;
  const h = await getSetting(env, 'HASH');
  if (h) {
    const au = (await getSetting(env, 'ADMIN_USER')).toLowerCase(), salt = await getSetting(env, 'SALT');
    ok = !!u && u === au && same(await hash(pw, salt), h);
  } else {
    // pertama kali: cocokkan dengan ADMIN_USER (var) dan ADMIN_PASS (secret), lalu simpan hash-nya
    const eu = String(env.ADMIN_USER || '').trim().toLowerCase(), ep = String(env.ADMIN_PASS || '').trim();
    ok = !!eu && !!ep && u === eu && same(pw, ep);
    if (ok) {
      const salt = crypto.randomUUID();
      await setSettings(env, { ADMIN_USER: eu, SALT: salt, HASH: await hash(pw, salt) });
    }
  }
  if (!ok) {
    const n = (+(await env.KV.get('F' + u)) || 0) + 1;
    if (n >= MAX_LOGIN) {
      await env.KV.put('K' + u, '1', { expirationTtl: LOCK_SEC });
      await env.KV.delete('F' + u);
      throw new HttpError('Percobaan habis (5 kali). Login dikunci 3 jam.');
    }
    await env.KV.put('F' + u, String(n), { expirationTtl: LOCK_SEC });
    throw new HttpError(`Username atau password salah. Sisa percobaan: ${MAX_LOGIN - n}.`);
  }
  await env.KV.delete('F' + u);
  const token = newToken();
  await env.KV.put('S' + token, u, { expirationTtl: SESSION_SEC });
  return { ok: true, token, user: u };
}
async function who(env, r) {
  const u = await env.KV.get('S' + String(r.token || ''));
  if (!u) throw new HttpError('Sesi berakhir, silakan login ulang.', true);
  return u;
}
async function chpass(env, r) {
  const np = String(r.baru || '').trim();
  if (np.length < 10) throw new HttpError('Password baru minimal 10 karakter.');
  const salt0 = await getSetting(env, 'SALT'), h0 = await getSetting(env, 'HASH');
  if (!same(await hash(String(r.lama || '').trim(), salt0), h0)) throw new HttpError('Password lama salah.');
  const salt = crypto.randomUUID();
  await setSettings(env, { SALT: salt, HASH: await hash(np, salt) });
  return { ok: true };
}
async function logout(env, r) {
  await env.KV.delete('S' + String(r.token || ''));
  return { ok: true };
}

/* ===== Manajemen servis (admin) ===== */
async function list(env) {
  const { results } = await env.DB.prepare('SELECT * FROM servis ORDER BY rowid DESC').all();
  return { ok: true, data: results };
}
async function update(env, r, u) {
  if (!ST.includes(r.status)) throw new HttpError('Status tidak valid.');
  const cat = clean(r.catatan, 500);
  const s = await env.DB.prepare('SELECT * FROM servis WHERE id_servis=?').bind(r.id).first();
  if (!s) throw new HttpError('Data tidak ditemukan.');
  const prev = s.status_servis, t = now();
  s.status_servis = r.status; s.catatan_teknisi = cat; s.tanggal_update = t;
  if (r.status === ST[3]) s.tanggal_selesai = t;
  if (r.status === ST[4]) s.tanggal_diambil = t;
  await env.DB.prepare('UPDATE servis SET status_servis=?,catatan_teknisi=?,tanggal_update=?,tanggal_selesai=?,tanggal_diambil=? WHERE id_servis=?')
    .bind(s.status_servis, s.catatan_teknisi, s.tanggal_update, s.tanggal_selesai, s.tanggal_diambil, s.id_servis).run();
  await logH(env, s, prev, r.status, cat, u);
  return { ok: true, data: s };
}
async function renew(env, r, u) {
  const s = await env.DB.prepare('SELECT id_servis,nomor_registrasi,status_servis FROM servis WHERE id_servis=?').bind(r.id).first();
  if (!s) throw new HttpError('Data tidak ditemukan.');
  const token = newToken();
  await env.DB.prepare('UPDATE servis SET token_qr=? WHERE id_servis=?').bind(token, s.id_servis).run();
  await logH(env, s, s.status_servis, s.status_servis, 'Token QR diperbarui', u);
  return { ok: true, token };
}

/* ===== Router ===== */
const PUB = { register, status, login };
const ADM = { list, update, renew, chpass, logout };

async function handleApi(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET') return json({ ok: true, app: 'MUHIBA MOTOR SERVICE' });
  if (request.method !== 'POST') return json({ ok: false, error: 'Metode tidak didukung.' }, 405);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ ok: false, error: 'Asal permintaan tidak diizinkan.' }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 20000) throw new HttpError('Data terlalu besar.');
    let r;
    try { r = JSON.parse(raw || '{}'); } catch { throw new HttpError('Permintaan tidak valid.'); }
    const ip = request.headers.get('cf-connecting-ip') || 'x';
    if (Object.hasOwn(PUB, r.action)) return json(await PUB[r.action](env, r, ip));
    if (Object.hasOwn(ADM, r.action)) return json(await ADM[r.action](env, r, await who(env, r)));
    throw new HttpError('Aksi tidak dikenal.');
  } catch (err) {
    if (err instanceof HttpError) {
      return json(err.auth ? { ok: false, auth: true, error: err.message } : { ok: false, error: err.message });
    }
    console.error(err);
    return json({ ok: false, error: 'Terjadi kesalahan server.' });
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api') return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
