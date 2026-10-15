// ==============================
// STORE UNTUK DATA BOT (SQLITE)
// ==============================
//
// Satu koneksi SQLite (file yang sama dengan postedJobs.db, mode WAL)
// untuk tabel data bot di luar dedup lowongan:
//
// - event_reminder_roles : role target reminder per scheduled event

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
    "SELECT event_id, role_id FROM event_reminder_roles"
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


// ==============================
// RESTORE DATA SETELAH RECOVERY
// ==============================
// Jika file lama korup dan berhasil diselamatkan sebagian, masukkan
// kembali baris-baris yang masih terbaca ke database baru.

function restoreSalvagedData() {

    if (!recovered) {
        return;
    }

    const [savedRoles] = salvaged;

    let restoredCount = 0;

    try {

        const insertRole = db.prepare(`
            INSERT OR IGNORE INTO event_reminder_roles (event_id, role_id)
            VALUES (?, ?)
        `);

        const restoreAll = db.transaction(() => {

            for (const row of savedRoles ?? []) {
                insertRole.run(row.event_id, row.role_id);
                restoredCount++;
            }
        });

        restoreAll();

        if (restoredCount > 0) {

            console.log(
                `♻️ ${restoredCount} mapping role reminder berhasil diselamatkan dari database korup.`
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
// CLEANUP
// ==============================

function closeDb() {
    db.close();
}


module.exports = {
    setEventReminderRole,
    getEventReminderRole,
    deleteEventReminderRole,
    closeDb
};
