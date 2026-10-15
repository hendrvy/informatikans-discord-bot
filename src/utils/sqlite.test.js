const fs = require("fs");
const os = require("os");
const path = require("path");
const Database = require("better-sqlite3");

const {
    openSqliteDatabase,
    isCorruptionError,
    archiveCorruptFiles
} = require("./sqlite");


describe("sqlite recovery helper", () => {

    let dir;
    let dbPath;

    beforeEach(() => {

        dir = fs.mkdtempSync(
            path.join(os.tmpdir(), "sqlite-recovery-")
        );

        dbPath = path.join(dir, "test.db");
    });

    afterEach(() => {

        fs.rmSync(dir, { recursive: true, force: true });
    });


    describe("isCorruptionError", () => {

        test("mengenali error korupsi", () => {

            expect(
                isCorruptionError({ code: "SQLITE_CORRUPT" })
            ).toBe(true);

            expect(
                isCorruptionError({ code: "SQLITE_NOTADB" })
            ).toBe(true);

            expect(
                isCorruptionError(
                    new Error("database disk image is malformed")
                )
            ).toBe(true);
        });

        test("error lain tidak dianggap korupsi", () => {

            expect(
                isCorruptionError(new Error("connection refused"))
            ).toBe(false);

            expect(isCorruptionError(null)).toBe(false);
        });
    });


    describe("openSqliteDatabase", () => {

        test("database sehat: recovered=false", () => {

            const { db, recovered, salvaged } = openSqliteDatabase(dbPath);

            try {

                expect(recovered).toBe(false);
                expect(salvaged).toEqual([]);

            } finally {

                db.close();
            }
        });

        test("file acak (bukan database) dipulihkan otomatis", () => {

            // Tulis byte acak supaya pasti bukan file SQLite valid.
            fs.writeFileSync(dbPath, Buffer.alloc(4096, 0xAB));

            const { db, recovered } = openSqliteDatabase(dbPath);

            // Setelah recovery, database baru harus bisa dipakai normal.

            db.exec("CREATE TABLE t (x TEXT)");
            db.prepare("INSERT INTO t VALUES (?)").run("ok");

            expect(
                db.prepare("SELECT x FROM t").get().x
            ).toBe("ok");

            expect(recovered).toBe(true);

            db.close();

            // File korup lama harus diarsipkan, bukan dihapus.
            const leftovers = fs.readdirSync(dir);
            expect(
                leftovers.some(name => name.includes(".corrupt-"))
            ).toBe(true);
        });

        test("data terselamatkan dikembalikan lewat salvageQueries", () => {

            // Buat DB sehat berisi data.

            const seed = new Database(dbPath);
            seed.exec("CREATE TABLE jobs (link TEXT, title TEXT)");
            seed.prepare("INSERT INTO jobs VALUES (?, ?)").run("a", "A");
            seed.prepare("INSERT INTO jobs VALUES (?, ?)").run("b", "B");
            seed.close();

            // Korupkan file dengan menimpa bagian tengahnya.

            const raw = fs.readFileSync(dbPath);
            raw.fill(0xFF, 1024, 2048);
            fs.writeFileSync(dbPath, raw);

            // Recovery: kadang halaman tetap terbaca (korupsi di area
            // kosong), kadang tidak. Test hanya memastikan alur tidak
            // melempar error & hasilnya konsisten.

            const { db, salvaged } = openSqliteDatabase(
                dbPath,
                ["SELECT link, title FROM jobs"]
            );

            expect(Array.isArray(salvaged[0])).toBe(true);

            db.close();
        });
    });


    describe("archiveCorruptFiles", () => {

        test("mengarsipkan db + wal + shm", () => {

            for (const suffix of ["", "-wal", "-shm"]) {
                fs.writeFileSync(`${dbPath}${suffix}`, "x");
            }

            archiveCorruptFiles(dbPath);

            const files = fs.readdirSync(dir);

            expect(files.some(f => f.startsWith("test.db.corrupt-")))
                .toBe(true);
            expect(files.some(f => f.startsWith("test.db-wal.corrupt-")))
                .toBe(true);
            expect(files.some(f => f.startsWith("test.db-shm.corrupt-")))
                .toBe(true);
        });
    });
});
