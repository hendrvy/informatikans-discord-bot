// ==============================
// REMINDER DEADLINE LOMBA
// ==============================
//
// Replika jobReminder.js untuk lomba IT. Tombol "🔔 Ingatkan saya"
// di embed lomba mendaftarkan DM pengingat otomatis H-3 & H-1
// sebelum deadline pendaftaran.
//
// Data lomba diambil dari tabel competitions_archive (disimpan saat
// lomba diposting oleh competitionPoster). Pengiriman dilakukan oleh
// scheduler periodik startCompetitionReminderScheduler() yang
// dipanggil dari ready.js.

const { EmbedBuilder, MessageFlags } = require("discord.js");

const {
    addCompetitionReminders,
    getDueCompetitionReminders,
    markCompetitionReminderSent,
    getCompetitionArchiveById
} = require("./store");


// Cek reminder tiap 5 menit — deadline adalah skala hari, tidak
// perlu lebih presisi dari ini.

const CHECK_INTERVAL_MS = 5 * 60 * 1000;


// ==============================
// HANDLE TOMBOL "🔔 INGATKAN SAYA"
// ==============================
// customId format: lombrem:<archiveId>
// Dipanggil dari interactionCreate.

async function handleLombaRemindButton(interaction) {

    const competitionId =
        Number(interaction.customId.split(":")[1]);

    const competition =
        getCompetitionArchiveById(competitionId);

    if (!competition) {

        await interaction.reply({
            content: "❌ Lomba ini tidak ditemukan di arsip.",
            flags: MessageFlags.Ephemeral
        }).catch(() => {});

        return true;
    }

    const result = addCompetitionReminders(
        interaction.user.id,
        competitionId,
        competition.deadline
    );

    let message;

    if (result.status === "invalid") {

        message =
            "⚠️ Lomba ini tidak punya deadline pendaftaran yang valid, jadi tidak bisa diingatkan.";

    } else if (result.status === "duplicate") {

        message =
            "📌 Kamu sudah terdaftar untuk pengingat lomba ini sebelumnya.";

    } else if (result.count === 0) {

        message =
            "⌛ Deadline lomba ini sudah terlalu dekat, pengingat tidak jadi dibuat. Segera daftar! 💪";

    } else {

        const deadlineText =
            new Date(competition.deadline).toLocaleDateString(
                "id-ID",
                { day: "numeric", month: "long", year: "numeric" }
            );

        message =
            `📬 Oke! Aku ingatkan kamu via DM di **H-3** dan **H-1** sebelum deadline.\n\n` +
            `⏰ Deadline: **${deadlineText}**\n` +
            `🏆 ${competition.title || "Lomba"}${competition.organizer ? ` — ${competition.organizer}` : ""}`;
    }

    await interaction.reply({
        content: message,
        flags: MessageFlags.Ephemeral
    }).catch(() => {});

    return true;
}


// ==============================
// KIRIM REMINDER YANG JATUH TEMPO
// ==============================

async function deliverDueCompetitionReminders(client) {

    const due = getDueCompetitionReminders();

    if (due.length === 0) {
        return;
    }

    for (const reminder of due) {

        // Tandai terkirim dulu supaya gagal DM tidak memicu
        // percobaan ulang terus-menerus tiap tick.

        markCompetitionReminderSent(reminder.id);

        // Sisa hari menuju deadline (untuk teks "H-x").

        const daysBefore = reminder.deadline
            ? Math.max(1, Math.ceil(
                (new Date(reminder.deadline).getTime() - Date.now()) /
                (24 * 60 * 60 * 1000)
            ))
            : null;

        try {

            const user = await client.users.fetch(reminder.user_id);

            const embed = new EmbedBuilder()

                .setTitle("⏰ Pengingat Deadline Lomba")

                .setDescription(
                    daysBefore
                        ? `Deadline pendaftaran lomba ini **${daysBefore} hari lagi**!`
                        : "Deadline pendaftaran lomba ini sudah dekat!"
                )

                .addFields(
                    {
                        name: "🏆 Lomba",
                        value: reminder.title || "Lomba IT"
                    },
                    {
                        name: "🏢 Penyelenggara",
                        value: reminder.organizer || "Tidak disebutkan",
                        inline: true
                    },
                    {
                        name: "⏰ Deadline",
                        value: reminder.deadline
                            ? new Date(reminder.deadline).toLocaleDateString(
                                "id-ID",
                                { day: "numeric", month: "long", year: "numeric" }
                            )
                            : "Tidak diketahui",
                        inline: true
                    }
                )

                .setColor(0xfee75c)

                .setFooter({
                    text: "Jangan lupa daftar! ⚠️ Verifikasi info di situs resmi."
                });

            if (reminder.link) {
                embed.addFields({
                    name: "🔗 Link",
                    value: reminder.link
                });
            }

            await user.send({ embeds: [embed] });

        } catch (error) {

            // DM gagal (DM closed, user tidak ditemukan, dll) —
            // tidak fatal, reminder sudah ditandai terkirim.

            console.error(
                `Gagal kirim reminder lomba ke ${reminder.user_id}:`,
                error.message
            );
        }
    }
}


// ==============================
// SCHEDULER PERIODIK
// ==============================

function startCompetitionReminderScheduler(client) {

    const interval = setInterval(() => {

        deliverDueCompetitionReminders(client).catch(error => {

            console.error(
                "Error di scheduler reminder lomba:",
                error.message
            );
        });

    }, CHECK_INTERVAL_MS);

    // Jangan cegah proses Node exit hanya karena interval ini.

    interval.unref();

    console.log(
        "Scheduler reminder deadline lomba aktif (cek tiap 5 menit)."
    );

    return interval;
}


module.exports = {
    handleLombaRemindButton,
    deliverDueCompetitionReminders,
    startCompetitionReminderScheduler,
    CHECK_INTERVAL_MS
};
