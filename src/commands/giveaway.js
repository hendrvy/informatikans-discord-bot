const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    EmbedBuilder
} = require("discord.js");

const {
    createGiveaway,
    getActiveGiveaways
} = require("../services/store");


// Batas durasi giveaway: minimal 1 menit, maksimal 30 hari.

const MIN_DURATION_MS = 60 * 1000;
const MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

const GIVEAWAY_EMOJI = "🎉";


const data = new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Kelola giveaway di server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
        subcommand
            .setName("start")
            .setDescription("Mulai giveaway baru")
            .addStringOption(option =>
                option
                    .setName("hadiah")
                    .setDescription("Hadiah yang diperebutkan")
                    .setRequired(true)
                    .setMaxLength(200)
            )
            .addStringOption(option =>
                option
                    .setName("durasi")
                    .setDescription("Durasi giveaway, contoh: 30m, 2h, 1d (m = menit, h = jam, d = hari)")
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName("list")
            .setDescription("Lihat daftar giveaway yang masih berjalan")
    );


// Parser durasi sama seperti /remindme (10m / 2h / 1d / "1d 12h").

function parseDuration(text) {

    const normalized = text.trim().toLowerCase();

    if (!normalized) {
        return null;
    }

    const units = { d: 24 * 60 * 60 * 1000, h: 60 * 60 * 1000, m: 60 * 1000 };

    let totalMs = 0;
    let matched = false;

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


// ==============================
// SUBCOMMAND: START
// ==============================

async function handleStart(interaction) {

    const prize = interaction.options.getString("hadiah", true);
    const durationText = interaction.options.getString("durasi", true);

    const durationMs = parseDuration(durationText);

    if (!durationMs) {

        await interaction.reply({
            content: "❌ Format durasi tidak valid. Contoh: `30m`, `2h`, `1d`, atau `1d 12h`.",
            ephemeral: true
        });

        return;
    }

    if (durationMs < MIN_DURATION_MS || durationMs > MAX_DURATION_MS) {

        await interaction.reply({
            content: "❌ Durasi giveaway harus antara 1 menit dan 30 hari.",
            ephemeral: true
        });

        return;
    }

    const endAt = new Date(Date.now() + durationMs);

    await interaction.deferReply();

    const embed = new EmbedBuilder()

        .setTitle("🎉 GIVEAWAY!")

        .setDescription(
            `Hadiah: **${prize}**\n` +
            `Dibuat oleh: <@${interaction.user.id}>\n` +
            `Berakhir: <t:${Math.floor(endAt.getTime() / 1000)}:R>\n\n` +
            `React ${GIVEAWAY_EMOJI} untuk ikut!`
        )

        .setColor(0xfee75c)

        .setFooter({
            text: "Semoga beruntung! ✨"
        })

        .setTimestamp(endAt);

    const message = await interaction.channel.send({
        content: `${GIVEAWAY_EMOJI} **GIVEAWAY** — ${prize}`,
        embeds: [embed]
    });

    await message.react(GIVEAWAY_EMOJI).catch(() => {});

    createGiveaway({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        messageId: message.id,
        prize,
        hostId: interaction.user.id,
        endAt: endAt.toISOString()
    });

    await interaction.editReply(
        `✅ Giveaway **${prize}** dimulai! Berakhir <t:${Math.floor(endAt.getTime() / 1000)}:R>.`
    );
}


// ==============================
// SUBCOMMAND: LIST
// ==============================

async function handleList(interaction) {

    const active = getActiveGiveaways(interaction.guildId);

    if (active.length === 0) {

        await interaction.reply({
            content: "📭 Tidak ada giveaway yang sedang berjalan.",
            ephemeral: true
        });

        return;
    }

    const lines = active.map((giveaway, index) => {

        const endTimestamp = Math.floor(
            new Date(giveaway.end_at).getTime() / 1000
        );

        return `${index + 1}. **${giveaway.prize}** — berakhir <t:${endTimestamp}:R> (host: <@${giveaway.host_id}>)`;
    });

    await interaction.reply({
        content: `🎉 **Giveaway aktif (${active.length}):**\n${lines.join("\n")}`,
        ephemeral: true
    });
}


async function execute(interaction) {

    switch (interaction.options.getSubcommand()) {

        case "start":
            await handleStart(interaction);
            break;

        case "list":
            await handleList(interaction);
            break;

        default:
            await interaction.reply({
                content: "❌ Subcommand tidak dikenal.",
                flags: MessageFlags.Ephemeral
            });
    }
}


module.exports = {
    data,
    execute,
    parseDuration
};
