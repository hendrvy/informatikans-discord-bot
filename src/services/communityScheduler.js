// ==============================
// DISPATCHER REMINDER & GIVEAWAY
// ==============================
//
// Dipanggil berkala (setiap 30 detik) dari ready.js. Tugasnya:
//
// 1. Mengirim reminder pribadi (/remindme) yang sudah jatuh tempo.
// 2. Mengundi giveaway (/giveaway) yang sudah melewati waktu selesai.
//
// Semua state disimpan di SQLite (services/store.js) sehingga tetap
// berjalan setelah bot restart.

const {
    EmbedBuilder
} = require("discord.js");

const {
    getDueReminders,
    markReminderSent,
    getDueGiveaways,
    finishGiveaway
} = require("./store");


const TICK_INTERVAL_MS = 30 * 1000;


// ==============================
// KIRIM REMINDER
// ==============================

async function deliverDueReminders(client) {

    const due = getDueReminders();

    for (const reminder of due) {

        // Tandai dulu supaya tidak terkirim dobel kalau tick berikutnya
        // berjalan sebelum pengiriman selesai.

        markReminderSent(reminder.id);

        try {

            const channel = await client.channels
                .fetch(reminder.channelId)
                .catch(() => null);

            if (channel) {

                const userMention = `<@${reminder.user_id}>`;

                await channel.send(
                    `⏰ ${userMention} **Pengingat:** ${reminder.message}`
                );

            } else {

                // Channel sudah terhapus -> fallback DM ke user.

                const user = await client.users
                    .fetch(reminder.user_id)
                    .catch(() => null);

                await user?.send(
                    `⏰ **Pengingat:** ${reminder.message}`
                ).catch(() => {});
            }

        } catch (error) {

            console.error(
                `Gagal mengirim reminder #${reminder.id}:`,
                error.message
            );
        }
    }

    if (due.length > 0) {
        console.log(`⏰ ${due.length} reminder terkirim.`);
    }
}


// ==============================
// UNDI GIVEAWAY
// ==============================

async function drawDueGiveaways(client) {

    const due = getDueGiveaways();

    for (const giveaway of due) {

        try {

            const channel = await client.channels
                .fetch(giveaway.channel_id)
                .catch(() => null);

            const message = channel
                ? await channel.messages
                    .fetch(giveaway.message_id)
                    .catch(() => null)
                : null;

            // Entry diambil dari reaksi 🎉 pada pesan giveaway.

            const reaction = message?.reactions?.cache?.get("🎉");

            const users = reaction
                ? await reaction.users.fetch()
                : new Map();

            // Buang bot & host dari kandidat pemenang.

            const candidates = [...users.values()]
                .filter(user => !user.bot && user.id !== giveaway.host_id);

            const winner = candidates.length > 0
                ? candidates[Math.floor(Math.random() * candidates.length)]
                : null;

            finishGiveaway(giveaway.id, winner?.id ?? null);

            if (message) {

                const resultEmbed = new EmbedBuilder()

                    .setTitle("🎉 Giveaway Selesai!")

                    .setDescription(
                        winner
                            ? `Hadiah **${giveaway.prize}** dimenangkan oleh ${winner}! Selamat! 🎊\n\nHubungi <@${giveaway.host_id}> untuk klaim hadiah.`
                            : `Sayang sekali, tidak ada peserta yang sah untuk hadiah **${giveaway.prize}**. 😢`
                    )

                    .setColor(winner ? 0x57f287 : 0xed4245)

                    .setTimestamp();

                await message.reply({
                    content: winner ? `🎉 Selamat ${winner}!` : "🎉 Giveaway berakhir.",
                    embeds: [resultEmbed]
                }).catch(() => {});

                await message.edit({
                    content: `🎉 **GIVEAWAY BERAKHIR** — ${giveaway.prize}`
                }).catch(() => {});

            } else {

                // Pesan giveaway sudah terhapus; cukup laporkan lewat
                // channel asal kalau masih ada.

                await channel?.send(
                    `⚠️ Giveaway "${giveaway.prize}" berakhir, tapi pesannya sudah tidak ditemukan (tidak bisa mengundi).`
                ).catch(() => {});
            }

            console.log(
                `🎉 Giveaway "${giveaway.prize}" selesai. Pemenang: ${winner?.tag ?? "tidak ada"}`
            );

        } catch (error) {

            console.error(
                `Gagal mengundi giveaway #${giveaway.id}:`,
                error.message
            );
        }
    }
}


// ==============================
// TICK UTAMA
// ==============================

function startScheduler(client) {

    const tick = async () => {

        try {

            await deliverDueReminders(client);
            await drawDueGiveaways(client);

        } catch (error) {

            console.error("Scheduler tick gagal:", error.message);
        }
    };

    const interval = setInterval(tick, TICK_INTERVAL_MS);

    // Jangan cegah proses Node keluar hanya karena scheduler ini.

    interval.unref?.();

    return interval;
}


module.exports = {
    startScheduler,
    deliverDueReminders,
    drawDueGiveaways,
    TICK_INTERVAL_MS
};
