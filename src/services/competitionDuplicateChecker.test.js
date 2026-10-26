const fs = require("fs");
const os = require("os");
const path = require("path");

describe("competitionDuplicateChecker", () => {

    let tempDbPath;
    let checker;

    beforeEach(() => {

        tempDbPath = path.join(
            os.tmpdir(),
            `test-posted-competitions-${Date.now()}-` +
            `${Math.random().toString(36).slice(2)}.db`
        );

        process.env.POSTED_JOBS_DB_PATH = tempDbPath;

        // Modul punya koneksi DB module-level → reset agar tiap test
        // mendapat DB file baru yang bersih.

        jest.resetModules();

        checker = require("./competitionDuplicateChecker");
    });

    afterEach(() => {

        checker.closeDb();

        delete process.env.POSTED_JOBS_DB_PATH;

        for (const suffix of ["", "-wal", "-shm"]) {

            const file = `${tempDbPath}${suffix}`;

            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        }
    });

    it("lomba baru dianggap belum pernah diposting", () => {

        const competition = {
            title: "Hackathon Nasional 2026",
            link: "https://infolomba.id/info-hackathon-1234"
        };

        expect(checker.isAlreadyPosted(competition)).toBe(false);
    });

    it("link sama (persis) terdeteksi duplikat", () => {

        const competition = {
            title: "Hackathon Nasional 2026",
            link: "https://infolomba.id/info-hackathon-1234"
        };

        checker.savePostedCompetition(competition);

        expect(checker.isAlreadyPosted(competition)).toBe(true);
    });

    it("link sama dengan query utm beda tetap terdeteksi duplikat", () => {

        checker.savePostedCompetition({
            title: "IT FEST 2026",
            link: "https://infolomba.id/info-it-fest-1000"
        });

        expect(
            checker.isAlreadyPosted({
                title: "IT FEST 2026",
                link:
                    "https://infolomba.id/info-it-fest-1000" +
                    "?utm_source=instagram&utm_medium=bio"
            })
        ).toBe(true);
    });

    it("judul sama dengan URL berbeda tetap terdeteksi duplikat", () => {

        // Lomba yang sama diumumkan di portal berbeda.

        checker.savePostedCompetition({
            title: "IT FEST 2026",
            link: "https://infolomba.id/info-it-fest-1000"
        });

        expect(
            checker.isAlreadyPosted({
                title: "it fest 2026",
                link: "https://www.infolombait.com/2026/06/it-fest.html"
            })
        ).toBe(true);
    });

    it("lomba berbeda (judul & link beda) tidak dianggap duplikat", () => {

        checker.savePostedCompetition({
            title: "Hackathon A 2026",
            link: "https://a.example.com/lomba"
        });

        expect(
            checker.isAlreadyPosted({
                title: "CTF Championship",
                link: "https://b.example.com/ctf"
            })
        ).toBe(false);
    });

    it("lomba tanpa link tetap bisa disimpan & terdeteksi via judul", () => {

        const competition = {
            title: "Lomba Tanpa Link 2026",
            link: null
        };

        checker.savePostedCompetition(competition);

        expect(checker.isAlreadyPosted(competition)).toBe(true);
    });

    it("menyimpan dua kali tidak melempar error", () => {

        const competition = {
            title: "Duplikat Cup",
            link: "https://example.com/dup"
        };

        checker.savePostedCompetition(competition);

        expect(() =>
            checker.savePostedCompetition(competition)
        ).not.toThrow();

        expect(checker.isAlreadyPosted(competition)).toBe(true);
    });

    describe("normalizeLink & normalizeTitle", () => {

        it("normalizeLink membuang query, hash, trailing slash", () => {

            expect(
                checker.normalizeLink(
                    "https://Info.com/lomba/?utm_source=ig#top"
                )
            ).toBe("https://info.com/lomba");
        });

        it("normalizeTitle membuang tahun & tanda baca", () => {

            expect(
                checker.normalizeTitle("IT FEST 2026 — Edisi V!")
            ).toBe("it fest edisi v");
        });
    });

});
