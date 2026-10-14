const {
    calculateReminders,
    formatReminderMessage,
    resolveMentionText
} = require("./eventReminder");


describe("calculateReminders", () => {

    it("hanya mengembalikan reminder yang waktunya masih di masa depan", () => {

        const now = new Date("2026-01-01T00:00:00Z");
        const startTime = new Date("2026-01-01T00:30:00Z"); // 30 menit dari sekarang

        const reminders = calculateReminders(startTime, now);

        const labels = reminders.map(r => r.label);

        // 30 menit, 15 menit, 5 menit, dan "Sekarang" harus ada.
        expect(labels).toEqual(
            expect.arrayContaining(["30 menit", "15 menit", "5 menit", "Sekarang"])
        );

        // H-7 dst sudah lewat (startTime cuma 30 menit dari now), tidak boleh ada.
        expect(labels).not.toContain("H-7");
        expect(labels).not.toContain("1 jam");
    });

    it("mengembalikan semua reminder kalau event masih jauh di masa depan (>7 hari)", () => {

        const now = new Date("2026-01-01T00:00:00Z");
        const startTime = new Date("2026-01-10T00:00:00Z"); // 9 hari dari sekarang

        const reminders = calculateReminders(startTime, now);

        expect(reminders).toHaveLength(12);
    });

    it("mengembalikan array kosong kalau event sudah lewat semua", () => {

        const now = new Date("2026-01-10T00:00:00Z");
        const startTime = new Date("2026-01-01T00:00:00Z"); // sudah lewat jauh

        const reminders = calculateReminders(startTime, now);

        expect(reminders).toHaveLength(0);
    });

});


describe("resolveMentionText", () => {

    it("mengembalikan mention role kalau role tersedia", () => {

        expect(resolveMentionText({ id: "12345" })).toBe("<@&12345>");
    });

    it("fallback ke @everyone kalau role null/undefined", () => {

        expect(resolveMentionText(null)).toBe("@everyone");
        expect(resolveMentionText(undefined)).toBe("@everyone");
    });

});


describe("formatReminderMessage", () => {

    it("format pesan 'Sekarang' menyatakan event sudah dimulai", () => {

        const text = formatReminderMessage({
            label: "Sekarang",
            eventName: "Workshop JS",
            eventUrl: "https://discord.com/events/1",
            startTime: new Date("2026-01-01T00:00:00Z"),
            mentionText: "@everyone"
        });

        expect(text).toContain("sudah dimulai");
        expect(text).toContain("Workshop JS");
        expect(text).toContain("@everyone");
    });

    it("format pesan reminder lain menyebutkan countdown", () => {

        const text = formatReminderMessage({
            label: "H-1",
            eventName: "Workshop JS",
            eventUrl: "https://discord.com/events/1",
            startTime: new Date("2026-01-01T00:00:00Z"),
            mentionText: "<@&999>"
        });

        expect(text).toContain("H-1 menuju event");
        expect(text).toContain("<@&999>");
    });

});
