const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "../data");
const DB_PATH =
    process.env.POSTED_JOBS_DB_PATH ||
    path.join(DATA_DIR, "postedJobs.db");
const LEGACY_JSON_PATH = path.join(DATA_DIR, "postedJobs.json");

const MAX_AGE_DAYS = 90;

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

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
