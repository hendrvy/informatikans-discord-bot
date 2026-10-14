const fs = require("fs");
const os = require("os");
const path = require("path");

describe("duplicateChecker", () => {

    let tempDbPath;
    let duplicateChecker;

    beforeEach(() => {

        tempDbPath = path.join(
            os.tmpdir(),
            `test-posted-jobs-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
        );

        process.env.POSTED_JOBS_DB_PATH = tempDbPath;

        // Modul ini punya koneksi DB module-level, jadi harus
        // di-reset agar setiap test mendapat DB file baru yang bersih.
        jest.resetModules();

        duplicateChecker = require("./duplicateChecker");
    });

    afterEach(() => {

        duplicateChecker.closeDb();

        delete process.env.POSTED_JOBS_DB_PATH;

        for (const suffix of ["", "-wal", "-shm"]) {

            const file = `${tempDbPath}${suffix}`;

            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        }
    });

    it("mengembalikan false untuk job yang belum pernah diposting", () => {

        const job = {
            title: "Software Engineer Intern",
            link: "https://example.com/jobs/1"
        };

        expect(duplicateChecker.isAlreadyPosted(job)).toBe(false);
    });

    it("mengembalikan true untuk job yang sudah disimpan sebelumnya", () => {

        const job = {
            title: "Software Engineer Intern",
            link: "https://example.com/jobs/2"
        };

        duplicateChecker.savePostedJob(job);

        expect(duplicateChecker.isAlreadyPosted(job)).toBe(true);
    });

    it("tidak menganggap link yang berbeda sebagai duplikat", () => {

        duplicateChecker.savePostedJob({
            title: "Job A",
            link: "https://example.com/jobs/a"
        });

        expect(
            duplicateChecker.isAlreadyPosted({
                link: "https://example.com/jobs/b"
            })
        ).toBe(false);
    });

    it("mengembalikan false jika job tidak punya link", () => {

        expect(
            duplicateChecker.isAlreadyPosted({ title: "Tanpa link" })
        ).toBe(false);
    });

    it("tidak melempar error ketika menyimpan job dengan link yang sama dua kali", () => {

        const job = {
            title: "Job Duplikat",
            link: "https://example.com/jobs/dup"
        };

        duplicateChecker.savePostedJob(job);

        expect(() => duplicateChecker.savePostedJob(job)).not.toThrow();

        expect(duplicateChecker.isAlreadyPosted(job)).toBe(true);
    });

});
