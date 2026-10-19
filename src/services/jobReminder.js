// ==============================
// REMINDER DEADLINE LOWONGAN
// ==============================
//
// Tombol "🔔 Ingatkan saya" di embed lowongan akan mendaftarkan DM
// pengingat otomatis H-3 & H-1 sebelum deadline lowongan.
//
// Data lowongan diambil dari tabel jobs_archive (disimpan saat
// lowongan diposting oleh jobPoster). Pengiriman dilakukan oleh
// scheduler periodik startJobReminderScheduler() yang dipanggil
// dari ready.js.

const { EmbedBuilder, MessageFlags } = require("discord.js");

const {
    addJobReminders,
    getDueJobReminders,
    markJobReminderSent,
    getJobArchiveById
} = require("./store");


// Cek reminder tiap 5 menit — deadline adalah skala hari, tidak
// perlu lebih presisi dari ini.

const CHECK_INTERVAL_MS = 5 * 60 * 1000;


// ==============================
// HANDLE TOMBOL "🔔 INGATKAN SAYA"
// ==============================
// customId format: jobrem:<archiveId>
// Dipanggil dari interactionCreate.

async function handleJobRemindButton(interaction) {

    const jobId = Number(interaction.customId.split(":")[1]);

    const job = getJobArchiveById(jobId);

    if (!job) {

        await interaction.reply({
            content: "❌ Lowongan ini tidak ditemukan di arsip.",
            flags: MessageFlags.Ephemeral
        }).catch(() => {});

        return true;
    }

    const result = addJobReminders(
        interaction.user.id,
        jobId,
        job.deadline
    );

    let message;

    if (result.status === "invalid") {

        message = "⚠️ Lowongan ini tidak punya deadline yang valid, jadi tidak bisa diingatkan.";

    } else if (result.status === "duplicate") {

        message = "📌 Kamu sudah terdaftar untuk pengingat lowongan ini sebelumnya.";

    } else if (result.count === 0) {

        message = "⌛ Deadline lowongan ini sudah terlalu dekat, pengingat tidak jadi dibuat. Langsung lamar saja! 💪";

    } else {

        const deadlineText = new Date(job.deadline).toLocaleDateString(
            "id-ID",
            { day: "numeric", month: "long", year: "numeric" }
        );

        message =
            `📬 Oke! Aku ingatkan kamu via DM di **H-3** dan **H-1** sebelum deadline.\n\n` +
            `⏰ Deadline: **${deadlineText}**\n` +
            `💼 ${job.title || "Lowongan"}${job.company ? ` — ${job.company}` : ""}`;
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

async function deliverDueJobReminders(client) {

    const due = getDueJobReminders();

    if (due.length === 0) {
        return;
    }

    for (const reminder of due) {

        // Tandai terkirim dulu supaya gagal DM tidak memicu
        // percobaan ulang terus-menerus tiap tick.

        markJobReminderSent(reminder.id);

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

                .setTitle("⏰ Pengingat Deadline Magang")

                .setDescription(
                    daysBefore
                        ? `Deadline lowongan ini **${daysBefore} hari lagi**!`
                        : "Deadline lowongan ini sudah dekat!"
                )

                .addFields(
                    {
                        name: "💼 Posisi",
                        value: reminder.title || "Lowongan magang"
                    },
                    {
                        name: "🏢 Perusahaan",
                        value: reminder.company || "Tidak disebutkan",
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

                .setColor(0xed4245)

                .setFooter({
                    text: "Jangan lupa melamar! ⚠️ Verifikasi keaslian lowongan sebelum melamar."
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
                `Gagal kirim reminder lowongan ke ${reminder.user_id}:`,
                error.message
            );
        }
    }
}


// ==============================
// SCHEDULER PERIODIK
// ==============================

function startJobReminderScheduler(client) {

    const interval = setInterval(() => {

        deliverDueJobReminders(client).catch(error => {

            console.error(
                "Error di scheduler reminder lowongan:",
                error.message
            );
        });

    }, CHECK_INTERVAL_MS);

    // Jangan cegah proses Node exit hanya karena interval ini.

    interval.unref();

    console.log(
        "Scheduler reminder deadline lowongan aktif (cek tiap 5 menit)."
    );

    return interval;
}


module.exports = {
    handleJobRemindButton,
    deliverDueJobReminders,
    startJobReminderScheduler,
    CHECK_INTERVAL_MS
};
