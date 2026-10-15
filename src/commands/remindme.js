const { SlashCommandBuilder } = require("discord.js");

const { createReminder } = require("../services/store");


// Durasi maksimal reminder: 90 hari (di luar itu kurang berguna dan
// rawan hilang makna).

const MAX_DELAY_MS = 90 * 24 * 60 * 60 * 1000;


const data = new SlashCommandBuilder()
    .setName("remindme")
    .setDescription("Buat pengingat pribadi")
    .addStringOption(option =>
        option
            .setName("waktu")
            .setDescription("Waktu pengingat, contoh: 10m, 2h, 1d (m = menit, h = jam, d = hari)")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("pesan")
            .setDescription("Isi pesan pengingat")
            .setRequired(true)
            .setMaxLength(500)
    );


// ==============================
// PARSE DURASI "10m" / "2h" / "1d"
// ==============================
// Mendukung gabungan seperti "1d 12h 30m".

function parseDuration(text) {

    const normalized = text.trim().toLowerCase();

    if (!normalized) {
        return null;
    }

    const units = { d: 24 * 60 * 60 * 1000, h: 60 * 60 * 1000, m: 60 * 1000 };

    let totalMs = 0;
    let matched = false;

    // Setiap token harus berupa angka + satuan yang dikenal.

    for (const token of normalized.split(/\s+/)) {

        const match = token.match(/^(\d+)([dhm])$/);

        if (!match) {
            return null;
        }

        totalMs += Number(match[1]) * units[match[2]];
        matched = true;
    }

    if (!matched || totalMs <= 0) {
        return null;
    }

    return totalMs;
}


function formatDuration(ms) {

    const minutes = Math.floor(ms / 60000) % 60;
    const hours = Math.floor(ms / 3600000) % 24;
    const days = Math.floor(ms / 86400000);

    const parts = [];

    if (days > 0) {
        parts.push(`${days} hari`);
    }

    if (hours > 0) {
        parts.push(`${hours} jam`);
    }

    if (minutes > 0) {
        parts.push(`${minutes} menit`);
    }

    return parts.join(" ") || "kurang dari semenit";
}


async function execute(interaction) {

    const durationText = interaction.options.getString("waktu", true);
    const message = interaction.options.getString("pesan", true);

    const delayMs = parseDuration(durationText);

    if (!delayMs) {

        await interaction.reply({
            content: "❌ Format waktu tidak valid. Contoh yang benar: `10m`, `2h`, `1d`, atau gabungan `1d 12h`.",
            ephemeral: true
        });

        return;
    }

    if (delayMs > MAX_DELAY_MS) {

        await interaction.reply({
            content: "❌ Maksimal pengingat adalah 90 hari ke depan.",
            ephemeral: true
        });

        return;
    }

    const remindAt = new Date(Date.now() + delayMs);

    // guildId boleh null (command bisa dipakai di DM bot).

    createReminder({
        userId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        message,
        remindAt: remindAt.toISOString()
    });

    await interaction.reply({
        content: `⏰ Oke! Aku akan mengingatkan kamu di channel ini **${formatDuration(delayMs)}** lagi:\n> ${message}`,
        ephemeral: true
    });
}


module.exports = {
    data,
    execute,
    parseDuration
};
