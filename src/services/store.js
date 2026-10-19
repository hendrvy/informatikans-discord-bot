// ==============================
// STORE UNTUK DATA BOT (SQLITE)
// ==============================
//
// Satu koneksi SQLite (file yang sama dengan postedJobs.db, mode WAL)
// untuk tabel data bot di luar dedup lowongan:
//
// - event_reminder_roles : role target reminder per scheduled event
// - jobs_archive         : arsip lowongan yang sudah diposting (/lowongan)
// - job_reminders        : pengingat deadline lowongan (tombol 🔔)
// - suggestions          : saran member (/saran)
// - suggestion_votes     : vote 👍/👎 per user per saran

const path = require("path");
const fs = require("fs");
const { openSqliteDatabase } = require("../utils/sqlite");

const DATA_DIR = path.join(__dirname, "../data");
const DB_PATH =
    process.env.POSTED_JOBS_DB_PATH ||
    path.join(DATA_DIR, "postedJobs.db");

// Query penyelamatan saat file DB korup: isi tabel lama dibaca
// sebisanya lalu dimasukkan kembali ke database baru.

const SALVAGE_QUERIES = [
    "SELECT event_id, role_id FROM event_reminder_roles",
    "SELECT link, title, company, location, category, source, deadline, posted_at FROM jobs_archive",
    "SELECT guild_id, user_id, content, status, created_at FROM suggestions"
];

const { db, salvaged, recovered } = openSqliteDatabase(
    DB_PATH,
    SALVAGE_QUERIES
);

db.exec(`
    CREATE TABLE IF NOT EXISTS event_reminder_roles (
        event_id TEXT PRIMARY KEY,
        role_id TEXT
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS jobs_archive (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        link TEXT NOT NULL UNIQUE,
        title TEXT,
        company TEXT,
        location TEXT,
        category TEXT,
        source TEXT,
        deadline TEXT,
        posted_at TEXT NOT NULL
    )
`);

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_jobs_archive_posted
    ON jobs_archive(posted_at DESC)
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS job_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        job_id INTEGER NOT NULL,
        remind_at TEXT NOT NULL,
        sent INTEGER NOT NULL DEFAULT 0
    )
`);

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_job_reminders_due
    ON job_reminders(sent, remind_at)
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        author_name TEXT,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        message_id TEXT,
        created_at TEXT NOT NULL
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS suggestion_votes (
        suggestion_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        vote INTEGER NOT NULL,
        PRIMARY KEY (suggestion_id, user_id)
    )
`);


// ==============================
// RESTORE DATA SETELAH RECOVERY
// ==============================
// Jika file lama korup dan berhasil diselamatkan sebagian, masukkan
// kembali baris-baris yang masih terbaca ke database baru.

function restoreSalvagedData() {

    if (!recovered) {
        return;
    }

    const [
        savedRoles,
        savedJobs,
        savedSuggestions
    ] = salvaged;

    let restoredCount = 0;

    try {

        const insertRole = db.prepare(`
            INSERT OR IGNORE INTO event_reminder_roles (event_id, role_id)
            VALUES (?, ?)
        `);

        const insertJob = db.prepare(`
            INSERT OR IGNORE INTO jobs_archive
                (link, title, company, location, category, source, deadline, posted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertSuggestion = db.prepare(`
            INSERT INTO suggestions (guild_id, user_id, author_name, content, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const restoreAll = db.transaction(() => {

            for (const row of savedRoles ?? []) {
                insertRole.run(row.event_id, row.role_id);
                restoredCount++;
            }

            for (const row of savedJobs ?? []) {
                insertJob.run(
                    row.link,
                    row.title ?? null,
                    row.company ?? null,
                    row.location ?? null,
                    row.category ?? null,
                    row.source ?? null,
                    row.deadline ?? null,
                    row.posted_at ?? new Date().toISOString()
                );
                restoredCount++;
            }

            for (const row of savedSuggestions ?? []) {
                insertSuggestion.run(
                    row.guild_id,
                    row.user_id,
                    row.author_name ?? null,
                    row.content,
                    row.status ?? "pending",
                    row.created_at ?? new Date().toISOString()
                );
                restoredCount++;
            }
        });

        restoreAll();

        if (restoredCount > 0) {

            console.log(
                `♻️ ${restoredCount} baris data berhasil diselamatkan dari database korup.`
            );
        }

    } catch (error) {

        console.error(
            "Gagal memulihkan data terselamatkan:",
            error.message
        );
    }
}

restoreSalvagedData();


// ==============================
// EVENT REMINDER ROLES
// ==============================
// Pengganti Map in-memory (client.eventReminderRoles) agar role target
// reminder tidak hilang saat bot restart.

function setEventReminderRole(eventId, roleId) {

    db.prepare(`
        INSERT INTO event_reminder_roles (event_id, role_id)
        VALUES (?, ?)
        ON CONFLICT(event_id) DO UPDATE SET role_id = excluded.role_id
    `).run(eventId, roleId ?? null);
}


function getEventReminderRole(eventId) {

    const row = db
        .prepare("SELECT role_id FROM event_reminder_roles WHERE event_id = ?")
        .get(eventId);

    return row?.role_id ?? null;
}


function deleteEventReminderRole(eventId) {

    db.prepare("DELETE FROM event_reminder_roles WHERE event_id = ?")
        .run(eventId);
}


// ==============================
// ARSIP LOWONGAN (/lowongan)
// ==============================

// Simpan lowongan ke arsip, kembalikan id barisnya (dipakai untuk
// customId tombol "🔔 Ingatkan").

function saveJobArchive({ link, title, company, location, category, source, deadline }) {

    if (!link) {
        return null;
    }

    db.prepare(`
        INSERT OR IGNORE INTO jobs_archive
            (link, title, company, location, category, source, deadline, posted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        link,
        title ?? null,
        company ?? null,
        location ?? null,
        category ?? null,
        source ?? null,
        deadline ?? null,
        new Date().toISOString()
    );

    const row = db
        .prepare("SELECT id FROM jobs_archive WHERE link = ?")
        .get(link);

    return row?.id ?? null;
}


// Ambil lowongan terakhir dari arsip dengan filter opsional.

function getRecentJobs({ limit = 10, category = null, keyword = null } = {}) {

    const clauses = [];
    const params = [];

    if (category) {
        clauses.push("category = ?");
        params.push(category);
    }

    if (keyword) {
        clauses.push("(title LIKE ? OR company LIKE ?)");
        params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const where = clauses.length > 0
        ? `WHERE ${clauses.join(" AND ")}`
        : "";

    params.push(limit);

    return db.prepare(`
        SELECT * FROM jobs_archive
        ${where}
        ORDER BY posted_at DESC, id DESC
        LIMIT ?
    `).all(...params);
}


function getJobArchiveById(id) {

    return db
        .prepare("SELECT * FROM jobs_archive WHERE id = ?")
        .get(id);
}


// ==============================
// REMINDER DEADLINE LOWONGAN
// ==============================

// Buat reminder H-3 & H-1 untuk satu user & satu lowongan.
// Mengembalikan { status, count }:
// - status "invalid"   : deadline tidak bisa diparse
// - status "duplicate" : user sudah pernah daftar di lowongan ini
// - status "created"   : berhasil; count = jumlah reminder dibuat
//   (bisa 0 kalau deadline sudah terlalu dekat / terlewat)

function addJobReminders(userId, jobId, deadlineIso) {

    const deadline = new Date(deadlineIso);

    if (!deadlineIso || isNaN(deadline.getTime())) {
        return { status: "invalid", count: 0 };
    }

    const existing = db
        .prepare("SELECT 1 FROM job_reminders WHERE user_id = ? AND job_id = ?")
        .get(userId, jobId);

    if (existing) {
        return { status: "duplicate", count: 0 };
    }

    const now = Date.now();

    const inserts = [];

    for (const daysBefore of [3, 1]) {

        const remindAt = new Date(
            deadline.getTime() - daysBefore * 24 * 60 * 60 * 1000
        );

        // Reminder yang waktunya sudah lewat tidak perlu dibuat.

        if (remindAt.getTime() <= now) {
            continue;
        }

        inserts.push(remindAt.toISOString());
    }

    const insert = db.prepare(`
        INSERT INTO job_reminders (user_id, job_id, remind_at)
        VALUES (?, ?, ?)
    `);

    const insertAll = db.transaction((times) => {

        for (const time of times) {
            insert.run(userId, jobId, time);
        }
    });

    insertAll(inserts);

    return { status: "created", count: inserts.length };
}


// Ambil reminder yang waktunya tiba & belum terkirim (gabung data job).

function getDueJobReminders(now = new Date()) {

    return db.prepare(`
        SELECT r.id, r.user_id, r.remind_at,
               j.title, j.company, j.link, j.deadline
        FROM job_reminders r
        JOIN jobs_archive j ON j.id = r.job_id
        WHERE r.sent = 0 AND r.remind_at <= ?
        ORDER BY r.remind_at ASC
        LIMIT 50
    `).all(now.toISOString());
}


function markJobReminderSent(id) {

    db.prepare("UPDATE job_reminders SET sent = 1 WHERE id = ?").run(id);
}


// ==============================
// SARAN (/saran)
// ==============================

function createSuggestion({ guildId, userId, authorName, content }) {

    const result = db.prepare(`
        INSERT INTO suggestions (guild_id, user_id, author_name, content, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        guildId,
        userId,
        authorName ?? null,
        content,
        new Date().toISOString()
    );

    return result.lastInsertRowid;
}


function getSuggestion(id) {

    return db
        .prepare("SELECT * FROM suggestions WHERE id = ?")
        .get(id);
}


function setSuggestionMessageId(id, messageId) {

    db.prepare("UPDATE suggestions SET message_id = ? WHERE id = ?")
        .run(messageId, id);
}


function setSuggestionStatus(id, status) {

    db.prepare("UPDATE suggestions SET status = ? WHERE id = ?")
        .run(status, id);
}


// Upsert vote user. Mengembalikan jumlah vote terbaru { up, down }.

function voteSuggestion(suggestionId, userId, vote) {

    db.prepare(`
        INSERT INTO suggestion_votes (suggestion_id, user_id, vote)
        VALUES (?, ?, ?)
        ON CONFLICT(suggestion_id, user_id)
        DO UPDATE SET vote = excluded.vote
    `).run(suggestionId, userId, vote);

    return getSuggestionVoteCounts(suggestionId);
}


function getSuggestionVoteCounts(suggestionId) {

    const row = db.prepare(`
        SELECT
            COALESCE(SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END), 0) AS up,
            COALESCE(SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END), 0) AS down
        FROM suggestion_votes
        WHERE suggestion_id = ?
    `).get(suggestionId);

    return { up: row.up, down: row.down };
}


// ==============================
// CLEANUP
// ==============================

function closeDb() {
    db.close();
}


module.exports = {
    // event reminder roles
    setEventReminderRole,
    getEventReminderRole,
    deleteEventReminderRole,

    // arsip lowongan
    saveJobArchive,
    getRecentJobs,
    getJobArchiveById,

    // reminder deadline lowongan
    addJobReminders,
    getDueJobReminders,
    markJobReminderSent,

    // saran
    createSuggestion,
    getSuggestion,
    setSuggestionMessageId,
    setSuggestionStatus,
    voteSuggestion,
    getSuggestionVoteCounts,

    closeDb
};
