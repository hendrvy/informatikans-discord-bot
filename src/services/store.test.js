const fs = require("fs");
const os = require("os");
const path = require("path");

describe("store", () => {

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


    describe("event reminder roles", () => {

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


    describe("reminders", () => {

        test("createReminder lalu getDueReminders mengembalikan yang jatuh tempo", () => {

            const past = new Date(Date.now() - 60_000).toISOString();
            const future = new Date(Date.now() + 60_000).toISOString();

            store.createReminder({
                userId: "user-1",
                guildId: "guild-1",
                channelId: "chan-1",
                message: "sudah jatuh tempo",
                remindAt: past
            });

            store.createReminder({
                userId: "user-1",
                guildId: "guild-1",
                channelId: "chan-1",
                message: "belum jatuh tempo",
                remindAt: future
            });

            const due = store.getDueReminders();

            expect(due).toHaveLength(1);
            expect(due[0].message).toBe("sudah jatuh tempo");
        });

        test("markReminderSent mencegah pengiriman dobel", () => {

            const past = new Date(Date.now() - 60_000).toISOString();

            const id = store.createReminder({
                userId: "user-2",
                guildId: "guild-1",
                channelId: "chan-1",
                message: "sekali saja",
                remindAt: past
            });

            store.markReminderSent(id);

            expect(store.getDueReminders()).toHaveLength(0);
        });

        test("getPendingRemindersByUser hanya milik user terkait", () => {

            const future = new Date(Date.now() + 60_000).toISOString();

            store.createReminder({
                userId: "user-a",
                guildId: "guild-1",
                channelId: "chan-1",
                message: "milik A",
                remindAt: future
            });

            store.createReminder({
                userId: "user-b",
                guildId: "guild-1",
                channelId: "chan-1",
                message: "milik B",
                remindAt: future
            });

            const pending = store.getPendingRemindersByUser("user-a");

            expect(pending).toHaveLength(1);
            expect(pending[0].message).toBe("milik A");
        });
    });


    describe("giveaways", () => {

        const baseGiveaway = {
            guildId: "guild-1",
            channelId: "chan-1",
            messageId: "msg-1",
            prize: "Voucher 50rb",
            hostId: "host-1",
            endAt: new Date(Date.now() - 1000).toISOString()
        };

        test("createGiveaway lalu getDueGiveaways mengembalikan yang berakhir", () => {

            store.createGiveaway(baseGiveaway);

            store.createGiveaway({
                ...baseGiveaway,
                messageId: "msg-2",
                endAt: new Date(Date.now() + 60_000).toISOString()
            });

            const due = store.getDueGiveaways();

            expect(due).toHaveLength(1);
            expect(due[0].message_id).toBe("msg-1");
        });

        test("getActiveGiveaways hanya giveaway yang belum diundi (ended=0)", () => {

            // Giveaway sudah lewat waktu tapi belum diundi tetap terhitung
            // aktif sampai scheduler menandainya selesai.

            store.createGiveaway(baseGiveaway);

            store.createGiveaway({
                ...baseGiveaway,
                messageId: "msg-3"
            });

            expect(store.getActiveGiveaways("guild-1")).toHaveLength(2);

            const due = store.getDueGiveaways()[0];

            store.finishGiveaway(due.id, null);

            const active = store.getActiveGiveaways("guild-1");

            expect(active).toHaveLength(1);
            expect(active[0].message_id).toBe("msg-3");
        });

        test("finishGiveaway menyimpan pemenang & menandai selesai", () => {

            store.createGiveaway(baseGiveaway);

            const giveaway = store.getDueGiveaways()[0];

            store.finishGiveaway(giveaway.id, "winner-1");

            expect(store.getDueGiveaways()).toHaveLength(0);

            const stored = store.getGiveawayByMessageId("msg-1");

            expect(stored.ended).toBe(1);
            expect(stored.winner_id).toBe("winner-1");
        });

        test("finishGiveaway tanpa pemenang tetap tercatat selesai", () => {

            store.createGiveaway(baseGiveaway);

            const giveaway = store.getDueGiveaways()[0];

            store.finishGiveaway(giveaway.id, null);

            const stored = store.getGiveawayByMessageId("msg-1");

            expect(stored.ended).toBe(1);
            expect(stored.winner_id).toBeNull();
        });
    });


    describe("trivia scores", () => {

        test("addTriviaPoint menambah poin user baru dari 0", () => {

            store.addTriviaPoint("guild-1", "user-1");

            expect(store.getUserTriviaScore("guild-1", "user-1")).toBe(1);
        });

        test("addTriviaPoint menumpuk poin user lama", () => {

            store.addTriviaPoint("guild-1", "user-1");
            store.addTriviaPoint("guild-1", "user-1");
            store.addTriviaPoint("guild-1", "user-1");

            expect(store.getUserTriviaScore("guild-1", "user-1")).toBe(3);
        });

        test("poin terpisah antar guild", () => {

            store.addTriviaPoint("guild-1", "user-1");
            store.addTriviaPoint("guild-2", "user-1");

            expect(store.getUserTriviaScore("guild-1", "user-1")).toBe(1);
            expect(store.getUserTriviaScore("guild-2", "user-1")).toBe(1);
        });

        test("getTopTriviaScores urut poin terbesar & terbatas limit", () => {

            store.addTriviaPoint("guild-1", "user-a");
            store.addTriviaPoint("guild-1", "user-b");
            store.addTriviaPoint("guild-1", "user-b");
            store.addTriviaPoint("guild-1", "user-c");
            store.addTriviaPoint("guild-1", "user-c");
            store.addTriviaPoint("guild-1", "user-c");

            const top = store.getTopTriviaScores("guild-1", 2);

            expect(top).toHaveLength(2);
            expect(top[0].points).toBe(3);
            expect(top[1].points).toBe(2);
        });

        test("getUserTriviaScore user tanpa poin mengembalikan 0", () => {

            expect(store.getUserTriviaScore("guild-1", "anonim")).toBe(0);
        });
    });
});
