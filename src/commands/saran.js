const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    MessageFlags
} = require("discord.js");

const config = require("../config");
const {
    createSuggestion,
    getSuggestion,
    setSuggestionMessageId,
    setSuggestionStatus,
    voteSuggestion,
    getSuggestionVoteCounts
} = require("../services/store");


const COLOR = 0xfee75c;

// Status saran: pending -> approved / rejected.

const STATUS_META = {
    pending: { label: "⏳ Menunggu review", color: 0xfee75c },
    approved: { label: "✅ Disetujui", color: 0x57f287 },
    rejected: { label: "❌ Ditolak", color: 0xed4245 }
};

const MAX_LENGTH = 1000;


const data = new SlashCommandBuilder()
    .setName("saran")
    .setDescription("Kirim saran untuk komunitas & server ini")
    .addStringOption(option =>
        option
            .setName("isi")
            .setDescription(`Isi saran kamu (maks ${MAX_LENGTH} karakter)`)
            .setRequired(true)
            .setMaxLength(MAX_LENGTH)
    );


// ==============================
// BUILD EMBED & TOMBOL
// ==============================

function buildSuggestionEmbed(suggestion, votes) {

    const status = STATUS_META[suggestion.status] || STATUS_META.pending;

    return new EmbedBuilder()

        .setTitle("💡 Saran Member")

        .setDescription(suggestion.content)

        .addFields(
            {
                name: "👤 Dari",
                value: suggestion.author_name || "Anonim",
                inline: true
            },
            {
                name: "📊 Vote",
                value: `👍 ${votes.up}  •  👎 ${votes.down}`,
                inline: true
            },
            {
                name: "📌 Status",
                value: status.label,
                inline: true
            }
        )

        .setColor(status.color)

        .setTimestamp(new Date(suggestion.created_at));
}


function buildSuggestionButtons(suggestionId) {

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`sugvote:up:${suggestionId}`)
                .setLabel("Setuju")
                .setEmoji("👍")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`sugvote:down:${suggestionId}`)
                .setLabel("Tidak setuju")
                .setEmoji("👎")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`sugstatus:approved:${suggestionId}`)
                .setLabel("Terima")
                .setEmoji("✅")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`sugstatus:rejected:${suggestionId}`)
                .setLabel("Tolak")
                .setEmoji("❌")
                .setStyle(ButtonStyle.Danger)
        )
    ];
}


// ==============================
// EXECUTE
// ==============================

async function execute(interaction) {

    if (!interaction.guildId) {

        await interaction.reply({
            content: "❌ Command ini hanya bisa dipakai di dalam server.",
            flags: MessageFlags.Ephemeral
        });

        return;
    }

    const content = interaction.options.getString("isi").trim();

    const targetChannelId =
        config.suggestionChannelId || config.channelId;

    let channel;

    try {

        channel = await interaction.client.channels.fetch(targetChannelId);

    } catch {

        await interaction.reply({
            content: "❌ Channel saran tidak ditemukan. Hubungi admin untuk mengecek `SUGGESTION_CHANNEL_ID`.",
            flags: MessageFlags.Ephemeral
        });

        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {

        const suggestionId = createSuggestion({
            guildId: interaction.guildId,
            userId: interaction.user.id,
            authorName: interaction.user.tag,
            content
        });

        const suggestion = getSuggestion(suggestionId);

        const votes = { up: 0, down: 0 };

        const message = await channel.send({
            embeds: [buildSuggestionEmbed(suggestion, votes)],
            components: buildSuggestionButtons(suggestionId)
        });

        setSuggestionMessageId(suggestionId, message.id);

        await interaction.editReply(
            "✅ Saran kamu terkirim! Lihat perkembangannya di channel saran. Terima kasih! 💡"
        );

    } catch (error) {

        console.error("Gagal menjalankan /saran:", error.message);

        await interaction.editReply(
            "❌ Gagal mengirim saran. Coba lagi nanti ya!"
        );
    }
}


// ==============================
// HANDLE TOMBOL VOTE & STATUS
// ==============================
// customId format:
// - sugvote:<up|down>:<id>
// - sugstatus:<approved|rejected>:<id>
// Dipanggil dari interactionCreate.

async function handleSuggestionButton(interaction) {

    const [kind, value, rawId] = interaction.customId.split(":");

    const suggestionId = Number(rawId);

    const suggestion = getSuggestion(suggestionId);

    if (!suggestion) {

        await interaction.reply({
            content: "❌ Saran ini tidak ditemukan (mungkin sudah lama/dihapus).",
            flags: MessageFlags.Ephemeral
        }).catch(() => {});

        return true;
    }

    // Tombol status khusus admin (Manage Server).

    if (kind === "sugstatus") {

        if (!interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageGuild
        )) {

            await interaction.reply({
                content: "🔒 Hanya admin (Manage Server) yang bisa mengubah status saran.",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});

            return true;
        }

        if (suggestion.status !== "pending") {

            await interaction.reply({
                content: "⚠️ Status saran ini sudah diputuskan sebelumnya.",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});

            return true;
        }

        setSuggestionStatus(suggestionId, value);
    }

    // Tombol vote: satu vote per user, bisa diganti.

    if (kind === "sugvote") {

        voteSuggestion(
            suggestionId,
            interaction.user.id,
            value === "up" ? 1 : -1
        );
    }

    // Rebuild embed dengan data & vote terbaru.

    const updated = getSuggestion(suggestionId);

    const votes = getSuggestionVoteCounts(suggestionId);

    await interaction.update({
        embeds: [buildSuggestionEmbed(updated, votes)]
    }).catch(() => {});

    return true;
}


module.exports = {
    data,
    execute,
    handleSuggestionButton,
    buildSuggestionEmbed,
    STATUS_META
};
