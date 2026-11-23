// MUHIBA MOTOR SERVICE - backend API | developed by @hndx07
// Semua logika (Database, Registration, ServiceManagement, Authentication, QRCode token, WhatsApp, Utilities) ada di file ini.
const TZ='Asia/Jakarta';
const H={
 SERVIS:['id_servis','nomor_registrasi','tanggal_daftar','nama_pemilik','plat_nomor','nomor_rangka','jenis_motor','tahun_pembuatan','jenis_layanan','nomor_whatsapp','alamat','status_servis','catatan_teknisi','token_qr','tanggal_update','tanggal_selesai','tanggal_diambil'],
 RIWAYAT:['id_riwayat','id_servis','nomor_registrasi','status_sebelumnya','status_baru','catatan','admin','tanggal_perubahan'],
 PENGATURAN:['kunci','nilai']};
const ST=['Menunggu','Pemeriksaan','Sedang Dikerjakan','Selesai','Sudah Diambil'];
const LY=['Servis + Ganti Oli','Servis Saja'];
const props=()=>PropertiesService.getScriptProperties();
const now=()=>Utilities.formatDate(new Date(),TZ,'yyyy-MM-dd HH:mm:ss');
let _ss;

// ===== Utilities =====
function clean(v,max){v=String(v==null?'':v).replace(/[\u0000-\u001f<>]/g,' ').trim().slice(0,max);return /^[=+\-@]/.test(v)?"'"+v:v;}
function normWA(v){v=String(v||'').replace(/\D/g,'');if(v.indexOf('0')===0)v='62'+v.slice(1);else if(v.indexOf('8')===0)v='62'+v;return /^628\d{8,12}$/.test(v)?v:'';}
function newToken(){return (Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'');}
function hash(p,salt){let h=salt+p;for(let i=0;i<1000;i++)h=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,h).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');return h;}
function out(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}

// ===== Database =====
function initDatabase(){
 if(_ss)return _ss;const p=props();let id=p.getProperty('SS_ID');
 const ss=id?SpreadsheetApp.openById(id):SpreadsheetApp.create('MUHIBA MOTOR SERVICE DB');
 if(!id)p.setProperty('SS_ID',ss.getId());
 Object.keys(H).forEach(n=>{let s=ss.getSheetByName(n);if(!s){s=ss.insertSheet(n);s.getRange('A:Q').setNumberFormat('@');s.getRange(1,1,1,H[n].length).setValues([H[n]]);s.setFrozenRows(1);}});
 return _ss=ss;}
function rows(n){const v=initDatabase().getSheetByName(n).getDataRange().getValues(),h=v.shift();return v.map((r,i)=>{const o={_row:i+2};h.forEach((k,j)=>o[k]=String(r[j]));return o;});}
function put(n,row,o){const s=initDatabase().getSheetByName(n),a=H[n].map(k=>o[k]==null?'':o[k]);row?s.getRange(row,1,1,a.length).setValues([a]):s.appendRow(a);}
function logH(s,from,to,cat,adm){put('RIWAYAT',0,{id_riwayat:Utilities.getUuid(),id_servis:s.id_servis,nomor_registrasi:s.nomor_registrasi,status_sebelumnya:from,status_baru:to,catatan:cat,admin:adm,tanggal_perubahan:now()});}

// ===== Registration (publik) =====
function register(r){
 const nama=clean(r.nama,80),wa=normWA(r.wa),alamat=clean(r.alamat,200),plat=clean(r.plat,12).toUpperCase(),rangka=clean(r.rangka,25).toUpperCase(),motor=clean(r.motor,50),tahun=String(r.tahun||'').trim();
 if(!nama||!alamat||!motor)throw 'Lengkapi semua data wajib.';
 if(!wa)throw 'Nomor WhatsApp tidak valid.';
 if(!/^[A-Z]{1,2} ?\d{1,4} ?[A-Z]{0,3}$/.test(plat))throw 'Format plat nomor tidak valid.';
 if(!/^[A-Z0-9]{5,25}$/.test(rangka))throw 'Nomor rangka tidak valid.';
 if(!/^\d{4}$/.test(tahun)||+tahun<1980||+tahun>new Date().getFullYear()+1)throw 'Tahun pembuatan tidak valid.';
 if(LY.indexOf(r.layanan)<0)throw 'Pilih jenis layanan.';
 const c=CacheService.getScriptCache(),k='R'+wa,n=+c.get(k)||0;if(n>=5)throw 'Terlalu banyak pendaftaran. Coba lagi nanti.';
 const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{
  const pre='TSM-'+Utilities.formatDate(new Date(),TZ,'yyyyMMdd')+'-';
  const seq=rows('SERVIS').filter(x=>x.nomor_registrasi.indexOf(pre)===0).length+1;
  const reg=pre+String(seq).padStart(3,'0'),t=now();
  const s={id_servis:Utilities.getUuid(),nomor_registrasi:reg,tanggal_daftar:t,nama_pemilik:nama,plat_nomor:plat,nomor_rangka:rangka,jenis_motor:motor,tahun_pembuatan:tahun,jenis_layanan:r.layanan,nomor_whatsapp:wa,alamat:alamat,status_servis:ST[0],catatan_teknisi:'',token_qr:newToken(),tanggal_update:t};
  put('SERVIS',0,s);logH(s,'',ST[0],'Pendaftaran masuk','sistem');
  c.put(k,String(n+1),3600);
  return{ok:true,nomor_registrasi:reg,tanggal_daftar:t};
 }finally{lock.releaseLock();}}

// ===== Cek status (publik, tanpa data pribadi sensitif) =====
function status(r){
 const c=CacheService.getScriptCache(),n=+c.get('SQ')||0;if(n>60)throw 'Terlalu banyak permintaan. Coba sesaat lagi.';c.put('SQ',String(n+1),60);
 const q=clean(r.q,64);if(!q)throw 'Masukkan nomor registrasi.';
 const s=rows('SERVIS').find(x=>x.nomor_registrasi===q.toUpperCase()||x.token_qr===q);if(!s)throw 'Data tidak ditemukan.';
 return{ok:true,data:{nomor_registrasi:s.nomor_registrasi,nama_pemilik:s.nama_pemilik,jenis_motor:s.jenis_motor,plat_nomor:s.plat_nomor,jenis_layanan:s.jenis_layanan,tanggal_daftar:s.tanggal_daftar,status_servis:s.status_servis,catatan_teknisi:s.catatan_teknisi},
  riwayat:rows('RIWAYAT').filter(h=>h.id_servis===s.id_servis).map(h=>({status:h.status_baru,catatan:h.catatan,tanggal:h.tanggal_perubahan}))};}

// ===== Authentication =====
// Set Script Properties INIT_USER & INIT_PASS lalu jalankan setupAdmin() SEKALI. INIT_PASS otomatis dihapus.
function setupAdmin(){const p=props(),u=String(p.getProperty('INIT_USER')||'').trim(),pw=String(p.getProperty('INIT_PASS')||'').trim();if(!u||!pw)throw new Error('Isi INIT_USER dan INIT_PASS di Script Properties.');const salt=Utilities.getUuid();p.setProperties({ADMIN_USER:u,SALT:salt,HASH:hash(pw,salt)});p.deleteProperty('INIT_PASS');initDatabase();}
// Diagnosa: jalankan cekAdmin() lalu lihat View > Logs. Tidak menampilkan rahasia.
function cekAdmin(){const p=props();console.log('ADMIN_USER: '+(p.getProperty('ADMIN_USER')||'(BELUM ADA - jalankan setupAdmin)'));console.log('HASH: '+(p.getProperty('HASH')?'ada':'BELUM ADA'));console.log('SALT: '+(p.getProperty('SALT')?'ada':'BELUM ADA'));console.log('INIT_PASS masih ada (setupAdmin belum jalan): '+!!p.getProperty('INIT_PASS'));}
const MAX_LOGIN=5,LOCK_SEC=10800; // 5 kali gagal -> kunci 3 jam (batas CacheService maks. 6 jam)
// Jalankan manual dari editor jika admin terkunci dan tidak mau menunggu 3 jam.
function bukaKunci(){const u=String(props().getProperty('ADMIN_USER')||'').toLowerCase();CacheService.getScriptCache().removeAll(['K'+u,'F'+u]);console.log('Kunci login dibuka untuk: '+u);}
function login(r){
 const u=clean(r.user,50).toLowerCase(),c=CacheService.getScriptCache(),k='F'+u,f=+c.get(k)||0;if(c.get('K'+u))throw 'Login dikunci karena 5 kali gagal. Coba lagi setelah 3 jam.';
 const p=props();
 if(u!==String(p.getProperty('ADMIN_USER')||'').toLowerCase()||hash(String(r.pass||'').trim(),p.getProperty('SALT')||'')!==p.getProperty('HASH')){const n=f+1;if(n>=MAX_LOGIN){c.put('K'+u,'1',LOCK_SEC);c.remove(k);throw 'Percobaan habis (5 kali). Login dikunci 3 jam.';}c.put(k,String(n),LOCK_SEC);throw 'Username atau password salah. Sisa percobaan: '+(MAX_LOGIN-n)+'.';}
 c.remove(k);const t=newToken();c.put('S'+t,u,21600);return{ok:true,token:t,user:u};}
function who(r){const u=CacheService.getScriptCache().get('S'+String(r.token||''));if(!u)throw{auth:1};return u;}
function chpass(r,u){const p=props(),np=String(r.baru||'').trim();if(np.length<10)throw 'Password baru minimal 10 karakter.';
 if(hash(String(r.lama||'').trim(),p.getProperty('SALT'))!==p.getProperty('HASH'))throw 'Password lama salah.';
 const salt=Utilities.getUuid();p.setProperties({SALT:salt,HASH:hash(np,salt)});return{ok:true};}
function logout(r){CacheService.getScriptCache().remove('S'+r.token);return{ok:true};}

// ===== Service management (admin) =====
function list(r,u){return{ok:true,data:rows('SERVIS').reverse().map(s=>{delete s._row;return s;})};}
function update(r,u){
 if(ST.indexOf(r.status)<0)throw 'Status tidak valid.';const cat=clean(r.catatan,500);
 const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{const s=rows('SERVIS').find(x=>x.id_servis===r.id);if(!s)throw 'Data tidak ditemukan.';
  const prev=s.status_servis,t=now();s.status_servis=r.status;s.catatan_teknisi=cat;s.tanggal_update=t;
  if(r.status===ST[3])s.tanggal_selesai=t;if(r.status===ST[4])s.tanggal_diambil=t;
  put('SERVIS',s._row,s);logH(s,prev,r.status,cat,u);delete s._row;return{ok:true,data:s};
 }finally{lock.releaseLock();}}
function renew(r,u){const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{const s=rows('SERVIS').find(x=>x.id_servis===r.id);if(!s)throw 'Data tidak ditemukan.';s.token_qr=newToken();put('SERVIS',s._row,s);logH(s,s.status_servis,s.status_servis,'Token QR diperbarui',u);return{ok:true,token:s.token_qr};}finally{lock.releaseLock();}}

// ===== Router =====
const PUB={register:register,status:status,login:login};
const ADM={list:list,update:update,renew:renew,chpass:chpass,logout:logout};
function doGet(){return out({ok:true,app:'MUHIBA MOTOR SERVICE'});}
function doPost(e){
 try{const r=JSON.parse(e.postData.contents||'{}');
  if(PUB[r.action])return out(PUB[r.action](r));
  if(ADM[r.action])return out(ADM[r.action](r,who(r)));
  throw 'Aksi tidak dikenal.';
 }catch(err){
  if(err&&err.auth)return out({ok:false,auth:true,error:'Sesi berakhir, silakan login ulang.'});
  if(typeof err==='string')return out({ok:false,error:err});
  console.error(err);return out({ok:false,error:'Terjadi kesalahan server.'});}}
