// ==============================
// EVENT REMINDER
// ==============================
//
// Menghitung jadwal reminder untuk sebuah scheduled event Discord, dan
// mengirim pesan reminder tersebut. Dipisah dari event handler agar
// logic penjadwalannya bisa diuji tanpa perlu Discord client asli.

const REMINDER_OFFSETS_MS = [
    { label: "H-7", ms: 7 * 24 * 60 * 60 * 1000 },
    { label: "H-5", ms: 5 * 24 * 60 * 60 * 1000 },
    { label: "H-3", ms: 3 * 24 * 60 * 60 * 1000 },
    { label: "H-1", ms: 1 * 24 * 60 * 60 * 1000 },
    { label: "12 jam", ms: 12 * 60 * 60 * 1000 },
    { label: "6 jam", ms: 6 * 60 * 60 * 1000 },
    { label: "3 jam", ms: 3 * 60 * 60 * 1000 },
    { label: "1 jam", ms: 1 * 60 * 60 * 1000 },
    { label: "30 menit", ms: 30 * 60 * 1000 },
    { label: "15 menit", ms: 15 * 60 * 1000 },
    { label: "5 menit", ms: 5 * 60 * 1000 },
    { label: "Sekarang", ms: 0 }
];

// setTimeout di Node tidak aman untuk delay sangat besar (> ~24.8 hari,
// batas signed 32-bit ms). Reminder H-7 paling jauh masih di bawah batas
// ini, tapi kita beri guard supaya tidak overflow kalau suatu saat ada
// offset yang lebih besar.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;


// ==============================
// HITUNG DAFTAR REMINDER YANG MASIH VALID (BELUM LEWAT)
// ==============================

function calculateReminders(startTime, now = new Date()) {

    const startMs = startTime.getTime();
    const nowMs = now.getTime();

    const reminders = [];

    for (const offset of REMINDER_OFFSETS_MS) {

        const runAtMs = startMs - offset.ms;
        const delayMs = runAtMs - nowMs;

        if (delayMs < 0) {
            continue;
        }

        if (delayMs > MAX_TIMEOUT_MS) {
            continue;
        }

        reminders.push({
            label: offset.label,
            runAt: new Date(runAtMs),
            delayMs
        });
    }

    return reminders;
}


// ==============================
// FORMAT TEKS REMINDER
// ==============================

function formatReminderMessage({
    label,
    eventName,
    eventUrl,
    startTime,
    mentionText
}) {

    const formattedStart = startTime.toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });

    if (label === "Sekarang") {

        return `>>> [${eventName}](${eventUrl}) sudah dimulai! ${mentionText}`;
    }

    return `>>> ${label} menuju event [${eventName}](${eventUrl}) pada ${formattedStart} ${mentionText}.`;
}


// ==============================
// RESOLVE MENTION TEXT (role tertentu, atau fallback @everyone)
// ==============================

function resolveMentionText(role) {

    if (role?.id) {
        return `<@&${role.id}>`;
    }

    return "@everyone";
}


// ==============================
// SCHEDULE SEMUA REMINDER UNTUK SATU EVENT
// ==============================
// channel: TextChannel discord.js (butuh .send)
// event: GuildScheduledEvent discord.js (butuh .name, .url, .scheduledStartAt)
// role: Role discord.js atau null/undefined (fallback @everyone)
// Mengembalikan array timeout handle (berguna untuk testing/cleanup)

function scheduleEventReminders(channel, event, role) {

    const startTime = event.scheduledStartAt
        ?? event.startTime
        ?? new Date();

    const reminders = calculateReminders(startTime);

    const mentionText = resolveMentionText(role);

    const timeouts = [];

    for (const reminder of reminders) {

        const timeout = setTimeout(async () => {

            try {

                const text = formatReminderMessage({
                    label: reminder.label,
                    eventName: event.name,
                    eventUrl: event.url,
                    startTime,
                    mentionText
                });

                await channel.send(text);

            } catch (error) {

                console.error(
                    `Gagal mengirim reminder '${reminder.label}' untuk event '${event.name}':`,
                    error.message
                );

            }

        }, reminder.delayMs);

        timeouts.push(timeout);
    }

    return timeouts;
}


module.exports = {
    calculateReminders,
    formatReminderMessage,
    resolveMentionText,
    scheduleEventReminders,
    REMINDER_OFFSETS_MS
};
