// ==============================
// OPENER SQLITE TAHAN KORUPSI
// ==============================
//
// Semua service yang membuka database SQLite (duplicateChecker, store)
// memakai helper ini. Jika file database korup (SQLITE_CORRUPT /
// SQLITE_NOTADB — misalnya karena server mati mendadak, disk penuh,
// atau file tersinkron saat sedang ditulis), helper ini akan:
//
// 1. Mencoba menyelamatkan baris yang masih bisa dibaca
//    (via salvageQueries, best-effort).
// 2. Mengarsipkan file korup dengan akhiran `.corrupt-<timestamp>`
//    (tidak dihapus, biar bisa dianalisis manual).
// 3. Membuat database baru yang kosong supaya bot tetap bisa jalan.
//
// Tanpa ini, file korup membuat bot crash-loop saat startup.

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");


function isCorruptionError(error) {

    return (
        error?.code === "SQLITE_CORRUPT" ||
        error?.code === "SQLITE_NOTADB" ||
        /malformed|corrupt|not a database/i.test(error?.message || "")
    );
}


function archiveCorruptFiles(dbPath) {

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    for (const suffix of ["", "-wal", "-shm"]) {

        const file = `${dbPath}${suffix}`;

        if (!fs.existsSync(file)) {
            continue;
        }

        try {

            fs.renameSync(file, `${file}.corrupt-${stamp}`);

            console.warn(
                `📦 File korup diarsipkan: ${file}.corrupt-${stamp}`
            );

        } catch (renameError) {

            console.error(
                `Gagal mengarsipkan file korup ${file}:`,
                renameError.message
            );
        }
    }
}


// ==============================
// BUKA DATABASE (DENGAN RECOVERY)
// ==============================
//
// salvageQueries: array query SELECT (string). Saat file korup dan
// berhasil dibuka sebagian, hasil tiap query dikembalikan di posisi
// yang sama pada array `salvaged` (baris yang gagal dibaca = []).
//
// Mengembalikan { db, salvaged, recovered }:
// - recovered = false : file sehat, salvaged berisi array kosong.
// - recovered = true  : file korup & telah diarsipkan; pemanggil
//   bertanggung jawab memulihkan `salvaged` ke skema barunya.

function openSqliteDatabase(dbPath, salvageQueries = []) {

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const open = () => {

        const db = new Database(dbPath);

        try {

            db.pragma("journal_mode = WAL");

            return db;

        } catch (error) {

            db.close();
            throw error;
        }
    };

    try {

        return {
            db: open(),
            salvaged: salvageQueries.map(() => []),
            recovered: false
        };

    } catch (error) {

        if (!isCorruptionError(error)) {
            throw error;
        }

        console.error(
            `🚨 Database SQLite korup terdeteksi: ${dbPath}`
        );
        console.error(
            "   Menjalankan pemulihan otomatis: menyelamatkan data, " +
            "mengarsipkan file korup, lalu membuat database baru."
        );

        // ===== 1) Selamatkan baris yang masih terbaca (best-effort) =====

        const salvaged = salvageQueries.map(() => []);

        try {

            const broken = new Database(dbPath, { readonly: true });

            try {

                salvaged.forEach((_, index) => {

                    try {

                        salvaged[index] = broken
                            .prepare(salvageQueries[index])
                            .all();

                    } catch {

                        // Tabel/segmen ini tidak bisa dibaca, lewati.
                    }
                });

            } finally {

                broken.close();
            }

        } catch {

            // File terlalu rusak untuk dibaca sama sekali.
        }

        // ===== 2) Arsipkan file korup =====

        archiveCorruptFiles(dbPath);

        // ===== 3) Database baru yang bersih =====

        return {
            db: open(),
            salvaged,
            recovered: true
        };
    }
}


module.exports = {
    openSqliteDatabase,
    isCorruptionError,
    archiveCorruptFiles
};
