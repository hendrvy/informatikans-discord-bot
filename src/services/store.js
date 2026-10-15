// ==============================
// STORE UNTUK FITUR KOMUNITAS
// ==============================
//
// Satu koneksi SQLite (file yang sama dengan postedJobs.db, mode WAL)
// untuk tabel-tabel fitur bot komunitas:
//
// - event_reminder_roles : role target reminder per scheduled event
// - reminders            : jadwal pengingat pribadi (/remindme)
// - giveaways            : giveaway aktif (/giveaway)
// - trivia_scores        : poin trivia per user per server (/trivia)

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
    "SELECT * FROM reminders WHERE sent = 0",
    "SELECT * FROM giveaways WHERE ended = 0",
    "SELECT guild_id, user_id, points FROM trivia_scores"
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
    CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT,
        channel_id TEXT NOT NULL,
        message TEXT NOT NULL,
        remind_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        sent INTEGER NOT NULL DEFAULT 0
    )
`);

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_reminders_due
    ON reminders(sent, remind_at)
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS giveaways (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL UNIQUE,
        prize TEXT NOT NULL,
        host_id TEXT NOT NULL,
        end_at TEXT NOT NULL,
        ended INTEGER NOT NULL DEFAULT 0,
        winner_id TEXT
    )
`);

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_giveaways_due
    ON giveaways(ended, end_at)
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS trivia_scores (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
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
        savedReminders,
        savedGiveaways,
        savedScores
    ] = salvaged;

    let restoredCount = 0;

    try {

        const insertRole = db.prepare(`
            INSERT OR IGNORE INTO event_reminder_roles (event_id, role_id)
            VALUES (?, ?)
        `);

        const insertReminder = db.prepare(`
            INSERT INTO reminders (user_id, guild_id, channel_id, message, remind_at, created_at, sent)
            VALUES (?, ?, ?, ?, ?, ?, 0)
        `);

        const insertGiveaway = db.prepare(`
            INSERT OR IGNORE INTO giveaways (guild_id, channel_id, message_id, prize, host_id, end_at, ended, winner_id)
            VALUES (?, ?, ?, ?, ?, ?, 0, NULL)
        `);

        const insertScore = db.prepare(`
            INSERT OR REPLACE INTO trivia_scores (guild_id, user_id, points)
            VALUES (?, ?, ?)
        `);

        const restoreAll = db.transaction(() => {

            for (const row of savedRoles ?? []) {
                insertRole.run(row.event_id, row.role_id);
                restoredCount++;
            }

            for (const row of savedReminders ?? []) {
                insertReminder.run(
                    row.user_id,
                    row.guild_id,
                    row.channel_id,
                    row.message,
                    row.remind_at,
                    row.created_at ?? new Date().toISOString()
                );
                restoredCount++;
            }

            for (const row of savedGiveaways ?? []) {
                insertGiveaway.run(
                    row.guild_id,
                    row.channel_id,
                    row.message_id,
                    row.prize,
                    row.host_id,
                    row.end_at
                );
                restoredCount++;
            }

            for (const row of savedScores ?? []) {
                insertScore.run(row.guild_id, row.user_id, row.points);
                restoredCount++;
            }
        });

        restoreAll();

        if (restoredCount > 0) {

            console.log(
                `♻️ ${restoredCount} baris data komunitas berhasil diselamatkan dari database korup.`
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
// REMINDERS (/remindme)
// ==============================

function createReminder({ userId, guildId, channelId, message, remindAt }) {

    const result = db.prepare(`
        INSERT INTO reminders (user_id, guild_id, channel_id, message, remind_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        userId,
        guildId ?? null,
        channelId,
        message,
        remindAt,
        new Date().toISOString()
    );

    return result.lastInsertRowid;
}


// Ambil semua reminder yang waktunya sudah tiba & belum terkirim.

function getDueReminders(now = new Date()) {

    return db.prepare(`
        SELECT * FROM reminders
        WHERE sent = 0 AND remind_at <= ?
        ORDER BY remind_at ASC
        LIMIT 50
    `).all(now.toISOString());
}


function getPendingRemindersByUser(userId) {

    return db.prepare(`
        SELECT * FROM reminders
        WHERE user_id = ? AND sent = 0
        ORDER BY remind_at ASC
    `).all(userId);
}


function markReminderSent(id) {

    db.prepare("UPDATE reminders SET sent = 1 WHERE id = ?").run(id);
}


// ==============================
// GIVEAWAYS (/giveaway)
// ==============================

function createGiveaway({ guildId, channelId, messageId, prize, hostId, endAt }) {

    const result = db.prepare(`
        INSERT INTO giveaways (guild_id, channel_id, message_id, prize, host_id, end_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(guildId, channelId, messageId, prize, hostId, endAt);

    return result.lastInsertRowid;
}


// Ambil giveaway yang sudah lewat waktu selesai & belum diundi.

function getDueGiveaways(now = new Date()) {

    return db.prepare(`
        SELECT * FROM giveaways
        WHERE ended = 0 AND end_at <= ?
        ORDER BY end_at ASC
    `).all(now.toISOString());
}


function getActiveGiveaways(guildId) {

    return db.prepare(`
        SELECT * FROM giveaways
        WHERE guild_id = ? AND ended = 0
        ORDER BY end_at ASC
    `).all(guildId);
}


function getGiveawayByMessageId(messageId) {

    return db
        .prepare("SELECT * FROM giveaways WHERE message_id = ?")
        .get(messageId);
}


function finishGiveaway(id, winnerId) {

    db.prepare(`
        UPDATE giveaways
        SET ended = 1, winner_id = ?
        WHERE id = ?
    `).run(winnerId ?? null, id);
}


// ==============================
// TRIVIA SCORES (/trivia)
// ==============================

function addTriviaPoint(guildId, userId) {

    db.prepare(`
        INSERT INTO trivia_scores (guild_id, user_id, points)
        VALUES (?, ?, 1)
        ON CONFLICT(guild_id, user_id)
        DO UPDATE SET points = points + 1
    `).run(guildId, userId);
}


function getTopTriviaScores(guildId, limit = 10) {

    return db.prepare(`
        SELECT user_id, points
        FROM trivia_scores
        WHERE guild_id = ?
        ORDER BY points DESC, user_id ASC
        LIMIT ?
    `).all(guildId, limit);
}


function getUserTriviaScore(guildId, userId) {

    const row = db.prepare(`
        SELECT points FROM trivia_scores
        WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);

    return row?.points ?? 0;
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

    // reminders
    createReminder,
    getDueReminders,
    getPendingRemindersByUser,
    markReminderSent,

    // giveaways
    createGiveaway,
    getDueGiveaways,
    getActiveGiveaways,
    getGiveawayByMessageId,
    finishGiveaway,

    // trivia
    addTriviaPoint,
    getTopTriviaScores,
    getUserTriviaScore,

    closeDb
};
