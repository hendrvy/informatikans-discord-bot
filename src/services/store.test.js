const fs = require("fs");
const os = require("os");
const path = require("path");

describe("store (event reminder roles)", () => {

    let tempDbPath;
    let store;

    beforeEach(() => {

        tempDbPath = path.join(
            os.tmpdir(),
            `test-store-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
        );

        process.env.POSTED_JOBS_DB_PATH = tempDbPath;

        // Modul ini punya koneksi DB module-level, jadi harus
        // di-reset agar setiap test mendapat DB file baru yang bersih.
        jest.resetModules();

        store = require("./store");
    });

    afterEach(() => {

        store.closeDb();

        delete process.env.POSTED_JOBS_DB_PATH;

        for (const suffix of ["", "-wal", "-shm"]) {

            const file = `${tempDbPath}${suffix}`;

            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        }
    });


    test("set lalu get mengembalikan roleId", () => {

        store.setEventReminderRole("evt1", "role-123");

        expect(store.getEventReminderRole("evt1")).toBe("role-123");
    });

    test("set dengan null (fallback @everyone) tetap tersimpan", () => {

        store.setEventReminderRole("evt2", null);

        expect(store.getEventReminderRole("evt2")).toBeNull();
    });

    test("set ulang event yang sama menimpa role lama", () => {

        store.setEventReminderRole("evt3", "role-a");
        store.setEventReminderRole("evt3", "role-b");

        expect(store.getEventReminderRole("evt3")).toBe("role-b");
    });

    test("get event yang tidak ada mengembalikan null", () => {

        expect(store.getEventReminderRole("tidak-ada")).toBeNull();
    });

    test("delete menghapus mapping", () => {

        store.setEventReminderRole("evt4", "role-x");
        store.deleteEventReminderRole("evt4");

        expect(store.getEventReminderRole("evt4")).toBeNull();
    });
});


describe("store (arsip lowongan & reminder deadline)", () => {

    let tempDbPath;
    let store;

    beforeEach(() => {

        tempDbPath = path.join(
            os.tmpdir(),
            `test-store-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
        );

        process.env.POSTED_JOBS_DB_PATH = tempDbPath;
        jest.resetModules();
        store = require("./store");
    });

    afterEach(() => {

        store.closeDb();
        delete process.env.POSTED_JOBS_DB_PATH;

        for (const suffix of ["", "-wal", "-shm"]) {

            const file = `${tempDbPath}${suffix}`;

            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        }
    });

    const job = {
        link: "https://contoh.com/lowongan/1",
        title: "Frontend Intern",
        company: "PT Contoh",
        location: "Bandung",
        category: "Frontend",
        source: "Jooble",
        deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
    };


    test("saveJobArchive menyimpan & mengembalikan id yang sama untuk link sama", () => {

        const id1 = store.saveJobArchive(job);
        const id2 = store.saveJobArchive({ ...job, title: "Updated" });

        expect(id1).toBe(id2);

        expect(store.getJobArchiveById(id1).title).toBe("Frontend Intern");
    });

    test("saveJobArchive tanpa link mengembalikan null", () => {

        expect(store.saveJobArchive({ title: "tanpa link" })).toBeNull();
    });

    test("getRecentJobs urut terbaru, filter kategori & kata kunci", () => {

        store.saveJobArchive(job);
        store.saveJobArchive({
            ...job,
            link: "https://contoh.com/lowongan/2",
            title: "Backend Intern",
            category: "Backend"
        });

        expect(store.getRecentJobs({ limit: 10 })).toHaveLength(2);
        expect(store.getRecentJobs({ limit: 10 })[0].category)
            .toBe("Backend");

        expect(store.getRecentJobs({ category: "Frontend" }))
            .toHaveLength(1);

        expect(store.getRecentJobs({ keyword: "backend" }))
            .toHaveLength(1);

        expect(store.getRecentJobs({ keyword: "tidakada" }))
            .toHaveLength(0);
    });

    test("addJobReminders membuat H-3 & H-1, duplicate ditolak", () => {

        const jobId = store.saveJobArchive(job);

        const result = store.addJobReminders(
            "user-1",
            jobId,
            job.deadline
        );

        expect(result.status).toBe("created");
        expect(result.count).toBe(2);

        const duplicate = store.addJobReminders(
            "user-1",
            jobId,
            job.deadline
        );

        expect(duplicate.status).toBe("duplicate");
    });

    test("addJobReminders dengan deadline tidak valid", () => {

        const jobId = store.saveJobArchive(job);

        expect(
            store.addJobReminders("user-1", jobId, "Tidak diketahui")
        ).toEqual({ status: "invalid", count: 0 });
    });

    test("getDueJobReminders hanya yang jatuh tempo, gabung data job", () => {

        const jobId = store.saveJobArchive(job);

        // Deadline 3 hari + 1 menit ke depan -> H-3 dibuat 1 menit
        // ke depan, H-1 dibuat ~2 hari ke depan.

        const deadline = new Date(
            Date.now() + 3 * 24 * 60 * 60 * 1000 + 60 * 1000
        ).toISOString();

        store.addJobReminders("user-1", jobId, deadline);

        // Semua reminder masih di masa depan -> belum ada yang due.

        expect(store.getDueJobReminders()).toHaveLength(0);

        // Simulasi waktu berjalan 2 menit: H-3 (1 menit ke depan)
        // kini jatuh tempo, H-1 belum.

        const simulatedNow = new Date(Date.now() + 2 * 60 * 1000);

        const due = store.getDueJobReminders(simulatedNow);

        expect(due).toHaveLength(1);
        expect(due[0].user_id).toBe("user-1");
        expect(due[0].title).toBe("Frontend Intern");

        // Setelah di-mark sent, tidak muncul lagi.

        store.markJobReminderSent(due[0].id);

        expect(store.getDueJobReminders(simulatedNow)).toHaveLength(0);
    });
});


describe("store (saran)", () => {

    let tempDbPath;
    let store;

    beforeEach(() => {

        tempDbPath = path.join(
            os.tmpdir(),
            `test-store-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
        );

        process.env.POSTED_JOBS_DB_PATH = tempDbPath;
        jest.resetModules();
        store = require("./store");
    });

    afterEach(() => {

        store.closeDb();
        delete process.env.POSTED_JOBS_DB_PATH;

        for (const suffix of ["", "-wal", "-shm"]) {

            const file = `${tempDbPath}${suffix}`;

            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        }
    });

    test("createSuggestion & getSuggestion", () => {

        const id = store.createSuggestion({
            guildId: "guild-1",
            userId: "user-1",
            authorName: "user#1",
            content: "Tambah channel musik dong"
        });

        const suggestion = store.getSuggestion(id);

        expect(suggestion.content).toBe("Tambah channel musik dong");
        expect(suggestion.status).toBe("pending");
        expect(suggestion.message_id).toBeNull();
    });

    test("setSuggestionMessageId & setSuggestionStatus", () => {

        const id = store.createSuggestion({
            guildId: "guild-1",
            userId: "user-1",
            content: "saran"
        });

        store.setSuggestionMessageId(id, "msg-123");
        store.setSuggestionStatus(id, "approved");

        const suggestion = store.getSuggestion(id);

        expect(suggestion.message_id).toBe("msg-123");
        expect(suggestion.status).toBe("approved");
    });

    test("voteSuggestion upsert & hitungan akurat", () => {

        const id = store.createSuggestion({
            guildId: "guild-1",
            userId: "user-1",
            content: "saran"
        });

        store.voteSuggestion(id, "user-a", 1);
        store.voteSuggestion(id, "user-b", 1);
        store.voteSuggestion(id, "user-c", -1);

        expect(store.getSuggestionVoteCounts(id))
            .toEqual({ up: 2, down: 1 });

        // user-a ganti pikiran: up -> down.

        store.voteSuggestion(id, "user-a", -1);

        expect(store.getSuggestionVoteCounts(id))
            .toEqual({ up: 1, down: 2 });
    });

    test("vote untuk saran berbeda tidak tercampur", () => {

        const id1 = store.createSuggestion({
            guildId: "guild-1",
            userId: "user-1",
            content: "saran 1"
        });

        const id2 = store.createSuggestion({
            guildId: "guild-1",
            userId: "user-1",
            content: "saran 2"
        });

        store.voteSuggestion(id1, "user-a", 1);

        expect(store.getSuggestionVoteCounts(id2))
            .toEqual({ up: 0, down: 0 });
    });
});
