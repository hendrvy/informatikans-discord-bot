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
