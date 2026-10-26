# Informatikans Discord Bot

Bot Discord komunitas Informatikans. Awalnya ada dua bot terpisah (bot utilitas/komunitas berbasis Python, dan bot pencari lowongan magang berbasis Node.js) — sekarang digabung jadi **satu bot** di repo ini.

## Fitur

### 🔍 Lowongan Magang IT (tidak berubah dari sebelumnya)

- Mengambil lowongan dari **Jooble API**, scraping **DevJobsIndo**, dan scraping **Kalibrr**.
- Mengambil detail lowongan (perusahaan, lokasi, deadline, requirements) untuk sumber yang mendukung.
- Filter relevansi berdasarkan kata kunci magang & bidang teknologi.
- Deduplikasi — lowongan yang sudah pernah diposting tidak akan diposting ulang.
- Penjadwalan otomatis setiap 6 jam (timezone Asia/Jakarta) menggunakan `node-cron`.
- Slash command `/testjob` untuk melihat preview format embed lowongan (khusus admin).
- Slash command `/cari` untuk mencari lowongan on-demand dengan filter kata kunci, kategori, lokasi, dan sumber.

### 🔔 Reminder Deadline & 📚 Arsip Lowongan

- Tombol **🔔 Ingatkan saya** di setiap embed lowongan (muncul jika deadline valid) — member yang menekannya akan menerima **DM otomatis 3 hari dan 1 hari sebelum deadline**.
- Slash command `/lowongan [kategori] [kata_kunci] [jumlah]` — melihat arsip lowongan yang sudah pernah diposting, dengan filter kategori/kata kunci. Data diambil dari SQLite, tanpa scraping ulang.

### 🏆 Lomba IT (AI Competition Finder)

- Mengambil lomba IT Indonesia dari **InfoLomba.id** (kategori IT), **InfoLombaIT.com** (feed Blogger), dan situs resmi penyelenggara (FindIT! UGM; GEMASTIK SPA — dijadikan seed manual).
- **AI hybrid**: lomba difilter rule-based dulu (hemat kuota), lalu diperkaya **Google Gemini** (`gemini-2.0-flash`) untuk ekstraksi terstruktur — kategori, deadline pendaftaran, biaya, target peserta, deskripsi, link pendaftaran langsung, plus verifikasi `is_tech`/`is_indonesia`. Jika API key kosong, kuota habis (429/403), atau request gagal → **fallback penuh ke ekstraksi rule-based** (regex tanggal Indonesia, link pendaftaran, kategori).
- Anti-duplikat 3 lapis: dedup antar-sumber dalam satu batch (Set link), link ternormalisasi (query/hash/trailing slash dibuang), dan judul ternormalisasi (tahun & tanda baca dibuang) — disimpan di SQLite `posted_competitions` (masa simpan 180 hari).
- Prioritas mahasiswa: lomba dengan target mahasiswa diposting lebih dulu (skor `getMahasiswaScore`), maksimum 10 posting per siklus.
- Penjadwalan otomatis setiap 6 jam (offset +30 menit dari scheduler lowongan, timezone Asia/Jakarta), kill switch `LOMBA_ENABLED=false`.
- Tombol **🔔 Ingatkan saya** di embed lomba → DM pengingat H-3 & H-1 sebelum deadline pendaftaran.
- Slash command `/lomba [kata_kunci] [jumlah]` — arsip lomba yang sudah diposting.
- Slash command `/testlomba [mode]` — preview format embed lomba (khusus admin).
- Alert otomatis ke channel (fallback DM ke `ADMIN_USER_ID`) jika sumber lomba gagal 3x berturut-turut.

### 💡 Saran Member (/saran)

- `/saran isi:<teks>` — member mengirim saran; saran tampil di channel saran (`SUGGESTION_CHANNEL_ID`, default: channel komunitas khusus) dalam bentuk embed sederhana tanpa tombol.

### 🚀 Auto-Deploy Otomatis (Pterodactyl-ready)

Push ke `main` → bot otomatis update tanpa perlu sentuh panel. Dijalankan oleh
**supervisor** (`deploy.js`) yang mengawasi proses bot:

```
node deploy.js            <- startup command di panel
 └─ src/index.js          <- proses bot (Discord + webhook listener)
```

Supervisor tidak pernah exit dan tidak membuka port sendiri, jadi panel tidak
akan menandai server **offline**. Yang di-restart saat deploy hanya proses
bot-nya.

Update dipicu dua jalur (dua-duanya aktif):

- **Webhook** — GitHub kirim push event, langsung deploy.
- **Polling** — cek tiap `POLL_SECONDS` (default 120 detik), jadi webhook yang gagal terkirim tetap tersusul.

Yang terjadi tiap deploy:

| Yang berubah | Aksi | Downtime |
|---|---|---|
| `README.md` / `*.test.js` saja | dicatat di log, tidak restart | tidak ada |
| File `src/**.js` | proses bot di-restart | ±2 detik |
| `package-lock.json` | `npm install --omit=dev` lalu restart | ±10 detik |
| `deploy.js` sendiri | log peringatan, restart manual dari panel | tidak ada |

**File yang tidak pernah ditimpa:** `.env`, `src/data/` (database SQLite),
`node_modules/`, `.git/`, `deploy.config.json`, `.deploy-state.json`. Token dan
riwayat lowongan aman saat deploy.

Shutdown selalu graceful — bot diberi waktu 10 detik untuk disconnect dari
gateway Discord dan menutup koneksi SQLite, supaya database WAL tidak korup.

Setup:

1. Startup command di panel: `node deploy.js`. Port dari panel otomatis terbaca lewat `SERVER_PORT`.
2. Copy `deploy.example.json` jadi `deploy.config.json`, lalu isi `secret`. (Semua nilainya juga bisa diisi lewat env var, dan env var menang.)
3. Buat secret acak:

   ```bash
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```

4. GitHub → **Settings → Webhooks → Add webhook**:
   - Payload URL: `http://<ip>:<port>/webhook`
   - Content type: **application/json**
   - Secret: samakan dengan `secret` di `deploy.config.json`
   - Events: **Just the push event**

Route yang tersedia:

- `POST /webhook` — diverifikasi HMAC-SHA256. Event/branch yang tidak cocok dibalas `202` dan diabaikan.
- `GET /health` — status bot, SHA yang sedang jalan, dan waktu deploy terakhir.

Catatan keamanan: tanpa secret, siapa pun yang bisa menjangkau port bisa memicu
deploy — isi sesegera mungkin. Kalau `npm install` gagal, bot lama tetap jalan
dan state tidak dimajukan, jadi polling berikutnya akan mencoba ulang.

> **`deploy.js` harus ter-commit dan ter-push ke repo.** Kalau tidak, setiap
> pull akan menghapusnya (sudah ada mekanisme pemulihan otomatis, tapi tetap
> dicatat sebagai peringatan di log).

Untuk menjalankan bot tanpa supervisor (listener tetap jalan dengan mekanisme
lama), pakai `npm run bot`.

### 🛠️ Utility

- `/help` — menu panduan interaktif: ringkasan semua kategori fitur + select menu untuk melihat detail command per kategori.
- `/ping` dan `$ping` — cek latency bot.

### 👋 Autorole & Role Angkatan

Memantau channel tertentu (`AUTOROLE_CHANNEL_IDS`) untuk format perkenalan member baru yang mengandung field: `nama`, `nama panggilan`, `angkatan`, `hobi`, `minat`. Jika terdeteksi, bot akan:

1. React 👋 dan kirim pesan sambutan menyebut nama panggilan.
2. Assign role `Informatikans` (nama bisa diubah lewat `AUTOROLE_ROLE_NAME`).
3. Mendeteksi tahun dari field **angkatan** (mendukung format 4 digit `2026` atau 2 digit `26`/`'26`) dan otomatis assign role angkatan dengan format **`Akt'XX`** (contoh: `Akt'26` untuk angkatan 2026). Jika role belum ada di server, bot akan membuatnya otomatis (butuh permission **Manage Roles**). Jika format angkatan tidak terdeteksi, langkah ini dilewati tanpa membatalkan langkah 1–2.

### 📋 Say / SayTo (khusus Administrator)

- `$say <pesan>` — bot mengirim ulang teks + attachment ke channel yang sama.
- `$sayto #channel <pesan>` — bot mengirim teks + attachment ke channel lain.

Dibatasi khusus member dengan permission **Administrator** untuk mencegah penyalahgunaan (bot "menyamar" mengirim pesan).

### 📅 Scheduled Event + Reminder Otomatis

- `/create_event` — membuat scheduled event Discord (voice/stage channel), dengan opsi nama, deskripsi, gambar cover (URL), waktu mulai/selesai (format `DD-MM-YYYY HH:MM`, WIB), dan role yang akan di-ping saat reminder.
- `/delete_event` — menghapus scheduled event berdasarkan ID.
- Reminder otomatis dikirim ke channel `EVENT_ANNOUNCE_CHANNEL_ID` pada H-7, H-5, H-3, H-1, 12 jam, 6 jam, 3 jam, 1 jam, 30 menit, 15 menit, 5 menit, dan saat event dimulai.
- Jika event dibuat manual lewat UI Discord (bukan via `/create_event`), atau role tidak diset, reminder akan fallback ping **@everyone**.
- Mapping role target reminder kini **disimpan di SQLite**, jadi tidak hilang lagi saat bot restart.

## Prasyarat

- Node.js v22 atau lebih baru.
- Sebuah Discord Application + Bot Token ([Discord Developer Portal](https://discord.com/developers/applications)).
- **Privileged Gateway Intents** yang harus diaktifkan manual di Developer Portal:
  - `Server Members Intent`
  - `Message Content Intent`
- Permission bot di server: `Manage Roles` (untuk autorole + role angkatan), `Manage Events` (untuk scheduled event), `Send Messages`, `Attach Files`.
- API key dari [Jooble](https://jooble.org/api/about).

## Instalasi

1. Clone/download repo ini, lalu install dependency:

   ```bash
   npm install
   ```

2. Copy `.env.example` menjadi `.env`, lalu isi dengan kredensial milikmu:

   ```bash
   cp .env.example .env
   ```

   | Variabel | Keterangan |
   |---|---|
   | `DISCORD_TOKEN` | Token bot Discord dari Developer Portal. |
   | `CHANNEL_ID` | ID channel Discord tempat lowongan magang akan diposting. |
   | `JOOBLE_API_KEY` | API key dari Jooble. |
   | `CLIENT_ID` | Application/Client ID bot Discord. |
   | `GUILD_ID` | ID server Discord tempat slash command didaftarkan. |
   | `POSTED_JOBS_DB_PATH` | (Opsional) Lokasi custom file SQLite dedup lowongan. |
   | `PREFIX` | Prefix untuk legacy text command, default `$`. |
   | `AUTOROLE_CHANNEL_IDS` | ID channel yang dipantau untuk deteksi perkenalan (pisahkan koma jika lebih dari satu). |
   | `AUTOROLE_ROLE_NAME` | Nama role utama yang diberikan setelah perkenalan, default `Informatikans`. |
   | `EVENT_ANNOUNCE_CHANNEL_ID` | Channel untuk announce event & reminder (default: sama dengan `CHANNEL_ID`). |
   | `SUGGESTION_CHANNEL_ID` | (Opsional) Channel tujuan saran dari `/saran` (default: channel komunitas khusus). |
   | `ADMIN_USER_ID` | (Opsional) User ID Discord yang menerima DM alert kritikal (scraper rusak). |
   | `LOMBA_CHANNEL_ID` | Channel tujuan posting lomba IT (default: sama dengan `CHANNEL_ID`). |
   | `GEMINI_API_KEY` | (Opsional) API key Google Gemini untuk ekstraksi AI lomba. Kosong = fallback rule-based murni. |
   | `LOMBA_MAX_AI_CALLS` | Maksimum panggilan AI per siklus, default 25 (hemat kuota free tier). |
   | `LOMBA_ENABLED` | Kill switch fitur lomba, default `true`. Set `false` untuk mematikan. |

   > **Jangan pernah commit file `.env`.** File ini sudah masuk `.gitignore`.

3. Jalankan bot:

   ```bash
   npm start
   ```

   `npm start` menjalankan supervisor auto-deploy (`deploy.js`) — ini yang
   dipakai di server/panel. Untuk menjalankan botnya saja tanpa supervisor:

   ```bash
   npm run bot
   ```

   Untuk mode development (auto-restart saat ada perubahan kode):

   ```bash
   npm run dev
   ```

## Struktur Proyek

```
deploy.js                             # 🚀 Supervisor auto-deploy (entry point produksi)
src/
├── index.js                          # Entry point bot: setup client, load commands/events, login
├── config.js                         # Baca & validasi semua env var di satu tempat
├── autodeploy/
│   └── listener.js                   # Webhook GitHub → lapor ke supervisor (atau deploy sendiri)
├── commands/                         # Slash command ("/")
│   ├── ping.js
│   ├── help.js                       # Menu panduan interaktif semua fitur
│   ├── testjob.js
│   ├── cari.js                       # Cari lowongan on-demand dengan filter
│   ├── lowongan.js                   # Arsip lowongan yang sudah diposting
│   ├── lomba.js                      # Arsip lomba IT yang sudah diposting
│   ├── testlomba.js                  # Preview embed lomba (admin)
│   ├── saran.js                      # Suggestion box dengan vote & status admin
│   ├── createEvent.js
│   └── deleteEvent.js
├── legacyCommands/                   # Prefix command ("$")
│   ├── ping.js
│   ├── say.js
│   └── sayto.js
├── events/                           # Discord client event handler
│   ├── ready.js                      # Registrasi command, presence, start cron scraping
│   ├── interactionCreate.js          # Router slash command + select menu (help)
│   ├── messageCreate.js              # Router prefix command + autorole + role angkatan
│   └── guildScheduledEventCreate.js  # Trigger penjadwalan reminder event
├── services/
│   ├── internshipChecker.js          # Logic pengecekan & posting lowongan (dipanggil dari ready.js & cron)
│   ├── eventReminder.js              # Hitung & kirim reminder scheduled event
│   ├── store.js                      # SQLite: role reminder event, arsip lowongan, reminder deadline
│   ├── jobCollector.js               # Menggabungkan lowongan dari semua sumber
│   ├── jobFilter.js                  # Filter relevansi (magang + bidang IT)
│   ├── jobDetailCollector.js         # Scraping detail lowongan (DevJobsIndo)
│   ├── jobCategory.js                # Kategorisasi lowongan untuk embed
│   ├── jobPoster.js                  # Membuat embed & posting ke Discord
│   ├── jobReminder.js                # Reminder deadline lowongan (tombol 🔔 + DM H-3/H-1)
│   └── duplicateChecker.js           # Pengecekan & penyimpanan lowongan yang sudah diposting (SQLite)
│   ├── competitionChecker.js         # Orkestrator lomba IT (dipanggil dari ready.js & cron)
│   ├── competitionCollector.js       # Menggabungkan lomba dari semua sumber
│   ├── competitionFilter.js          # Filter relevansi lomba (tech + Indonesia + skor mahasiswa)
│   ├── aiEnricher.js                 # Ekstraksi Gemini (fallback rule-based) deadline/kategori/biaya/target
│   ├── competitionPoster.js          # Embed lomba + tombol 🔔 Daftar/Ingatkan
│   ├── competitionReminder.js        # Reminder deadline lomba (tombol 🔔 + DM H-3/H-1)
│   └── competitionDuplicateChecker.js # Dedup lomba (link & judul ternormalisasi, SQLite)
├── sources/
│   ├── jooble.js                     # Integrasi Jooble API
│   ├── devjobsindo.js                # Scraping DevJobsIndo
│   ├── kalibrr.js                    # Scraping Kalibrr
│   ├── infolombaId.js                # Scraping infolomba.id (kategori IT)
│   ├── infolombaIt.js                # Feed Blogger infolombait.com
│   └── competitionSeed.js            # Situs resmi penyelenggara (seed)
├── utils/
│   ├── loadCommands.js               # Dynamic loader untuk commands/ & legacyCommands/
│   ├── parseAngkatan.js              # Parsing tahun angkatan dari pesan perkenalan
│   ├── time.js                       # Helper parse/format waktu Asia/Jakarta
│   └── retry.js                      # Helper retry + exponential backoff untuk request HTTP
└── data/
    └── postedJobs.db                 # Database SQLite (dedup lowongan + mapping role reminder)
```

## Catatan Keamanan

- Rotate `DISCORD_TOKEN` dan `JOOBLE_API_KEY` jika pernah tidak sengaja terekspos (misalnya tersinkron ke cloud storage atau ter-commit ke git).
- File `.env` tidak boleh dibagikan atau di-commit ke version control.
- `$say`/`$sayto` dibatasi ke Administrator karena bot bisa mengirim pesan "menyamar" sebagai bot — jangan longgarkan permission ini tanpa pertimbangan matang.

## Keterbatasan yang Diketahui

- Scraping DevJobsIndo & Kalibrr bergantung pada struktur HTML situs tersebut; jika situs berubah, scraping bisa gagal. Sudah ada retry + alert otomatis ke channel (dan fallback DM ke `ADMIN_USER_ID` jika diisi).

## Pemulihan Database Otomatis

Jika file SQLite (`src/data/postedJobs.db`) korup — misalnya karena server mati mendadak atau disk penuh — bot **tidak akan crash-loop**. Saat startup, `src/utils/sqlite.js` otomatis:

1. Menyelamatkan baris yang masih bisa dibaca (riwayat lowongan, mapping role reminder).
2. Mengarsipkan file korup sebagai `postedJobs.db.corrupt-<timestamp>` (beserta `-wal`/`-shm`), tidak dihapus.
3. Membuat database baru dan memulihkan data yang terselamatkan.

Log kejadiannya ditandai dengan `🚨 Database SQLite korup terdeteksi` dan `♻️ ... berhasil diselamatkan`.

## Menjalankan Test

```bash
npm test
```

Test mencakup: filter relevansi lowongan (`jobFilter.js`), dedup storage (`duplicateChecker.js`), store (`store.js` — role reminder event, arsip lowongan, reminder deadline), filter lomba (`competitionFilter.js`), dedup lomba (`competitionDuplicateChecker.js`), enricher AI/fallback (`aiEnricher.js`), verifikasi signature webhook deploy (`listener.test.js`), parsing angkatan (`parseAngkatan.js`), dan kalkulasi jadwal reminder event (`eventReminder.js`).

## Deployment dengan Docker

```bash
docker build -t internship-discord-bot .
docker run -d --env-file .env -v $(pwd)/src/data:/app/src/data internship-discord-bot
```

Volume `src/data` di-mount agar database SQLite (riwayat lowongan yang sudah diposting) tidak hilang saat container di-restart.

## Riwayat

Repo ini sebelumnya hanya berisi bot pencari lowongan magang. Fitur ping, say/sayto, autorole, dan scheduled event reminder dipindahkan (rewrite dari Python/discord.py ke JavaScript/discord.js) dari bot komunitas `informatikans-bot` yang kini diarsipkan.
