const path = require("path");
const fs = require("fs");
const { openSqliteDatabase } = require("../utils/sqlite");

const DATA_DIR = path.join(__dirname, "../data");
const DB_PATH =
    process.env.POSTED_JOBS_DB_PATH ||
    path.join(DATA_DIR, "postedJobs.db");
const LEGACY_JSON_PATH = path.join(DATA_DIR, "postedJobs.json");

const MAX_AGE_DAYS = 90;

// Query penyelamatan: riwayat lowongan lama dibaca sebisanya saat
// file korup, lalu dimasukkan kembali ke database baru.

const SALVAGE_QUERIES = [
    "SELECT link, title, posted_at FROM posted_jobs"
];

const { db, salvaged, recovered } = openSqliteDatabase(
    DB_PATH,
    SALVAGE_QUERIES
);

db.exec(`
    CREATE TABLE IF NOT EXISTS posted_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        link TEXT NOT NULL UNIQUE,
        title TEXT,
        posted_at TEXT NOT NULL
    )
`);

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_posted_jobs_link
    ON posted_jobs(link)
`);

// Kembalikan riwayat lowongan yang berhasil diselamatkan.

if (recovered && salvaged[0]?.length > 0) {

    try {

        const insert = db.prepare(`
            INSERT OR IGNORE INTO posted_jobs (link, title, posted_at)
            VALUES (?, ?, ?)
        `);

        const restore = db.transaction((rows) => {

            for (const row of rows) {

                if (!row.link) {
                    continue;
                }

                insert.run(row.link, row.title ?? null, row.posted_at);
            }
        });

        restore(salvaged[0]);

        console.log(
            `♻️ ${salvaged[0].length} riwayat lowongan berhasil diselamatkan dari database korup.`
        );

    } catch (error) {

        console.error(
            "Gagal memulihkan riwayat lowongan:",
            error.message
        );
    }
}


// =====================================
// MIGRASI DARI postedJobs.json (LEGACY)
// =====================================

function migrateFromLegacyJson() {

    if (!fs.existsSync(LEGACY_JSON_PATH)) {
        return;
    }

    const rowCount = db
        .prepare("SELECT COUNT(*) AS count FROM posted_jobs")
        .get().count;

    if (rowCount > 0) {
        return;
    }

    try {

        const raw = fs.readFileSync(LEGACY_JSON_PATH, "utf8");
        const legacyJobs = JSON.parse(raw || "[]");

        if (!Array.isArray(legacyJobs) || legacyJobs.length === 0) {
            return;
        }

        const insert = db.prepare(
            `INSERT OR IGNORE INTO posted_jobs (link, title, posted_at)
             VALUES (@link, @title, @postedAt)`
        );

        const insertMany = db.transaction((jobs) => {
            for (const job of jobs) {
                if (!job.link) {
                    continue;
                }

                insert.run({
                    link: job.link,
                    title: job.title || null,
                    postedAt: job.postedAt || new Date().toISOString()
                });
            }
        });

        insertMany(legacyJobs);

        console.log(
            `📦 Migrasi ${legacyJobs.length} data lama dari postedJobs.json ke SQLite selesai.`
        );

        fs.renameSync(
            LEGACY_JSON_PATH,
            `${LEGACY_JSON_PATH}.migrated`
        );

    } catch (error) {

        console.error(
            "Gagal migrasi dari postedJobs.json:",
            error.message
        );
    }
}

migrateFromLegacyJson();


// =====================================
// PRUNING DATA LAMA
// =====================================

function pruneOldJobs() {

    const cutoff = new Date(
        Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    db.prepare(
        "DELETE FROM posted_jobs WHERE posted_at < ?"
    ).run(cutoff);
}


// =====================================
// API PUBLIK
// =====================================

function isAlreadyPosted(job) {

    if (!job.link) {
        return false;
    }

    const row = db
        .prepare("SELECT 1 FROM posted_jobs WHERE link = ?")
        .get(job.link);

    return !!row;
}


function savePostedJob(job) {

    try {

        db.prepare(
            `INSERT OR IGNORE INTO posted_jobs (link, title, posted_at)
             VALUES (?, ?, ?)`
        ).run(
            job.link,
            job.title || null,
            new Date().toISOString()
        );

        pruneOldJobs();

        console.log(`💾 Lowongan disimpan: ${job.title}`);

    } catch (error) {

        console.error(
            "Gagal menyimpan postedJob:",
            error.message
        );
    }
}


function closeDb() {
    db.close();
}


module.exports = {
    isAlreadyPosted,
    savePostedJob,
    closeDb
};
