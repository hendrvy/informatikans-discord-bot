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
   | `ADMIN_USER_ID` | (Opsional) User ID Discord yang menerima DM alert kritikal (scraper rusak). |

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
│   ├── store.js                      # SQLite mapping role reminder event
│   ├── jobCollector.js               # Menggabungkan lowongan dari semua sumber
│   ├── jobFilter.js                  # Filter relevansi (magang + bidang IT)
│   ├── jobDetailCollector.js         # Scraping detail lowongan (DevJobsIndo)
│   ├── jobCategory.js                # Kategorisasi lowongan untuk embed
│   ├── jobPoster.js                  # Membuat embed & posting ke Discord
│   └── duplicateChecker.js           # Pengecekan & penyimpanan lowongan yang sudah diposting (SQLite)
├── sources/
│   ├── jooble.js                     # Integrasi Jooble API
│   ├── devjobsindo.js                # Scraping DevJobsIndo
│   └── kalibrr.js                    # Scraping Kalibrr
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

Test mencakup: filter relevansi lowongan (`jobFilter.js`), dedup storage (`duplicateChecker.js`), store mapping role reminder (`store.js`), verifikasi signature webhook deploy (`listener.test.js`), parsing angkatan (`parseAngkatan.js`), dan kalkulasi jadwal reminder event (`eventReminder.js`).

## Deployment dengan Docker

```bash
docker build -t internship-discord-bot .
docker run -d --env-file .env -v $(pwd)/src/data:/app/src/data internship-discord-bot
```

Volume `src/data` di-mount agar database SQLite (riwayat lowongan yang sudah diposting) tidak hilang saat container di-restart.

## Riwayat

Repo ini sebelumnya hanya berisi bot pencari lowongan magang. Fitur ping, say/sayto, autorole, dan scheduled event reminder dipindahkan (rewrite dari Python/discord.py ke JavaScript/discord.js) dari bot komunitas `informatikans-bot` yang kini diarsipkan.
