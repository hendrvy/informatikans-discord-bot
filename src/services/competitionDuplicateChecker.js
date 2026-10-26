// ==============================
// ANTI-DUPLIKAT LOMBA (SQLITE)
// ==============================
//
// Replika duplicateChecker.js untuk lomba, dengan 3 lapis:
// 1. Antar-sumber dalam satu batch  → Set di competitionChecker.
// 2. Antar-siklus via link ternormalisasi (link_norm).
// 3. Antar-siklus via judul ternormalisasi (title_norm) — lomba yang
//    sama sering diumumkan di URL berbeda (halaman HIMA vs portal).
//
// Tabel disimpan di postedJobs.db yang sama (satu koneksi, WAL) dan
// ikut sistem pemulihan korup otomatis via openSqliteDatabase.

const path = require("path");
const { openSqliteDatabase } = require("../utils/sqlite");

const DATA_DIR = path.join(__dirname, "../data");
const DB_PATH =
    process.env.POSTED_JOBS_DB_PATH ||
    path.join(DATA_DIR, "postedJobs.db");

// Lomba lebih panjang usia dibanding lowongan magang (bisa buka
// pendaftaran berbulan-bulan), jadi masa simpan lebih panjang.

const MAX_AGE_DAYS = 180;

const SALVAGE_QUERIES = [
    "SELECT link_norm, title_norm, posted_at FROM posted_competitions"
];

const { db, salvaged, recovered } = openSqliteDatabase(
    DB_PATH,
    SALVAGE_QUERIES
);

db.exec(`
    CREATE TABLE IF NOT EXISTS posted_competitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        link_norm TEXT NOT NULL UNIQUE,
        title_norm TEXT NOT NULL,
        posted_at TEXT NOT NULL
    )
`);

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_posted_competitions_link
    ON posted_competitions(link_norm)
`);

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_posted_competitions_title
    ON posted_competitions(title_norm)
`);

// Kembalikan riwayat lomba yang berhasil diselamatkan saat recovery.

if (recovered && salvaged[0]?.length > 0) {

    try {

        const insert = db.prepare(`
            INSERT OR IGNORE INTO posted_competitions
                (link_norm, title_norm, posted_at)
            VALUES (?, ?, ?)
        `);

        const restore = db.transaction((rows) => {

            for (const row of rows) {

                if (!row.link_norm) {
                    continue;
                }

                insert.run(
                    row.link_norm,
                    row.title_norm ?? "",
                    row.posted_at
                );
            }
        });

        restore(salvaged[0]);

        console.log(
            `♻️ ${salvaged[0].length} riwayat lomba berhasil ` +
            "diselamatkan dari database korup."
        );

    } catch (error) {

        console.error(
            "Gagal memulihkan riwayat lomba:",
            error.message
        );
    }
}


// ==============================
// NORMALISASI LINK & JUDUL
// ==============================

// Link: lowercase, buang query string (utm_*, ref, dsb), buang
// trailing slash. Contoh:
// https://Info.com/lomba/?utm_source=ig → https://info.com/lomba

function normalizeLink(link) {

    if (!link) {
        return "";
    }

    return link
        .trim()
        .toLowerCase()
        .replace(/\?.*$/, "")
        .replace(/#.*$/, "")
        .replace(/\/+$/, "");
}

// Judul: lowercase, buang tahun & tanda baca, spasi dirapikan.
// "IT FEST 2026" dan "IT FEST 2025" → sama, karena posting ulang
// edisi tahun baru tetap dianggap duplikat (bot hanya tertarik pada
// lomba yang belum pernah diumumkan). Edge case: kalau edisi tahun
// baru ingin diumumkan, judul biasanya beda total (nama event baru).

function normalizeTitle(title) {

    if (!title) {
        return "";
    }

    return title
        .toLowerCase()
        .replace(/\b20\d{2}\b/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}


// ==============================
// PRUNING DATA LAMA
// ==============================

function pruneOldCompetitions() {

    const cutoff = new Date(
        Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    db.prepare(
        "DELETE FROM posted_competitions WHERE posted_at < ?"
    ).run(cutoff);
}


// ==============================
// API PUBLIK
// ==============================

// Cek 2 lapis sekaligus: link_norm ATAU title_norm sudah pernah
// diposting → dianggap duplikat.

function isAlreadyPosted(competition) {

    const linkNorm = normalizeLink(competition.link);
    const titleNorm = normalizeTitle(competition.title);

    if (linkNorm) {

        const byLink = db
            .prepare(
                "SELECT 1 FROM posted_competitions WHERE link_norm = ?"
            )
            .get(linkNorm);

        if (byLink) {
            return true;
        }
    }

    if (titleNorm) {

        const byTitle = db
            .prepare(
                "SELECT 1 FROM posted_competitions WHERE title_norm = ?"
            )
            .get(titleNorm);

        if (byTitle) {
            return true;
        }
    }

    return false;
}

function savePostedCompetition(competition) {

    try {

        const linkNorm = normalizeLink(competition.link);
        const titleNorm = normalizeTitle(competition.title);

        if (!linkNorm && !titleNorm) {
            return;
        }

        // Kalau link kosong tapi judul ada, pakai judul sebagai
        // kunci link agar UNIQUE constraint tetap terpenuhi.

        const effectiveLink =
            linkNorm || `title:${titleNorm}`;

        db.prepare(`
            INSERT OR IGNORE INTO posted_competitions
                (link_norm, title_norm, posted_at)
            VALUES (?, ?, ?)
        `).run(
            effectiveLink,
            titleNorm,
            new Date().toISOString()
        );

        pruneOldCompetitions();

        console.log(
            `💾 Lomba disimpan: ${competition.title}`
        );

    } catch (error) {

        console.error(
            "Gagal menyimpan postedCompetition:",
            error.message
        );
    }
}


function closeDb() {
    db.close();
}


module.exports = {
    isAlreadyPosted,
    savePostedCompetition,
    normalizeLink,
    normalizeTitle,
    closeDb
};
