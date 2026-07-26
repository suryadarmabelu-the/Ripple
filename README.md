# Ripple — Chat web pribadi (mirip WhatsApp)

Web chat 1-on-1 dengan pesan real-time, kirim file apa saja, ambil & kirim foto dari kamera,
dan video call peer-to-peer (WebRTC). Murni HTML/CSS/JS (tanpa build step) — tinggal di-host
di **GitHub Pages** dan pakai **Supabase** sebagai backend (auth, database, storage, realtime).

## Struktur folder

```
ripple-chat/
├─ index.html          → halaman login/daftar
├─ chat.html            → aplikasi chat utama
├─ css/style.css
├─ js/
│  ├─ config.js         → ISI dengan URL & anon key Supabase kamu
│  ├─ supabaseClient.js
│  ├─ auth.js            → logika login/daftar
│  ├─ app.js              → logika chat, kontak, file, kamera
│  └─ call.js              → logika video call (WebRTC)
└─ supabase/schema.sql   → skema database, jalankan di Supabase
```

## 1. Buat project Supabase

1. Buka https://supabase.com → **New project** (gratis).
2. Setelah project siap, buka **SQL Editor** → tempel seluruh isi
   `supabase/schema.sql` → **Run**. Ini akan membuat tabel `profiles`,
   `contacts`, `conversations`, `messages`, fungsi `add_contact_mutual`,
   RLS (Row Level Security), realtime, dan storage bucket `attachments`.
3. Buka **Authentication → Providers → Email**. Untuk kemudahan testing,
   kamu bisa nonaktifkan "Confirm email" (opsional) supaya bisa langsung
   login setelah daftar tanpa klik link email dulu. Untuk produksi,
   sebaiknya biarkan aktif.
4. Buka **Project Settings → API** → salin **Project URL** dan
   **anon public key**.

## 2. Hubungkan kode ke Supabase

Buka `js/config.js`, isi dua baris ini dengan milikmu:

```js
export const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

`anon key` **aman** ditaruh di kode frontend publik (termasuk repo GitHub publik) —
semua akses data tetap dibatasi oleh RLS yang sudah diatur di `schema.sql`, bukan oleh
kerahasiaan key ini.

## 3. Coba lokal (opsional)

Karena pakai ES Modules, buka lewat server lokal (bukan `file://`), misalnya:

```bash
npx serve .
# atau
python3 -m http.server 8080
```

Lalu buka `http://localhost:8080`.

## 4. Deploy ke GitHub Pages

1. Buat repo baru di GitHub, push seluruh folder ini ke branch `main`.
2. Di repo → **Settings → Pages** → Source: pilih branch `main`, folder `/ (root)`.
3. Tunggu beberapa menit, situs akan aktif di
   `https://<username>.github.io/<nama-repo>/`.

## Cara pakai aplikasi

1. Buka situs → tab **Daftar** → isi nama pengguna, email, kata sandi.
2. Login di perangkat/akun kedua dengan email lain (untuk mencoba chat & call).
3. Tekan tombol **＋** di sidebar → masukkan email pengguna lain → **Tambah**.
   Kontak otomatis muncul di kedua sisi.
4. Klik kontak → kirim pesan teks, klik ikon 📎 untuk kirim file apa saja,
   atau ikon 📷 untuk ambil foto langsung dari kamera dan kirim.
5. Klik ikon 📹 di header chat untuk memulai video call. Penerima akan
   melihat notifikasi panggilan masuk dengan tombol Terima/Tolak.

## Cara kerja video call

Video call memakai **WebRTC** langsung antar browser (peer-to-peer), dan
**Supabase Realtime (broadcast)** hanya dipakai sebagai jalur "signaling"
(bertukar offer/answer/ICE candidate) — video/audio itu sendiri tidak lewat
server Supabase.

Untuk STUN, aplikasi ini pakai server publik Google (`stun.l.google.com`).
Ini cukup untuk kebanyakan jaringan rumah/kantor. Kalau kamu menemukan
panggilan sering gagal tersambung di jaringan tertentu (mis. NAT simetris
di kantor/hotel), itu tandanya kamu butuh server **TURN** tambahan — bisa
pakai layanan seperti Twilio, Cloudflare Calls, atau Metered.ca, lalu
tambahkan ke `ICE_SERVERS` di `js/call.js`.

## Catatan keamanan & batasan

- Bucket storage `attachments` diatur *public read* supaya pratinjau
  gambar/file mudah ditampilkan — siapa pun yang tahu URL filenya bisa
  membukanya. Untuk kebutuhan lebih privat, ganti jadi bucket privat dan
  gunakan `createSignedUrl` di `app.js` saat menampilkan lampiran.
- Fitur "kontak" di sini sederhana (langsung tertambah, tanpa persetujuan).
- Ini proyek starter yang bisa dikembangkan lebih lanjut, misalnya:
  status "sedang mengetik", centang biru dibaca, grup chat, notifikasi push,
  hapus/edit pesan, dsb.

## Izin browser

Browser akan meminta izin akses **kamera** dan **mikrofon** saat kamu
membuka kamera foto atau memulai/menerima video call. Karena GitHub Pages
otomatis pakai HTTPS, izin ini akan berfungsi normal (browser modern
mewajibkan HTTPS untuk `getUserMedia`, kecuali di `localhost`).
