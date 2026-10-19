const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

const config = require("../config");


const COLOR = 0xfee75c;

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
// BUILD EMBED SARAN
// ==============================

function buildSuggestionEmbed(content) {

    return new EmbedBuilder()

        .setTitle("💡 Saran Member")

        .setDescription(content)

        .setColor(COLOR)

        .setTimestamp();
}


// ==============================
// EXECUTE
// ==============================

async function execute(interaction) {

    const content = interaction.options.getString("isi").trim();

    const targetChannelId = config.suggestionChannelId;

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

    try {

        await channel.send({
            embeds: [buildSuggestionEmbed(content)]
        });

        await interaction.reply({
            content: "✅ Saran kamu terkirim! Terima kasih! 💡",
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {

        console.error("Gagal menjalankan /saran:", error.message);

        await interaction.reply({
            content: "❌ Gagal mengirim saran. Coba lagi nanti ya!",
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }
}


module.exports = {
    data,
    execute,
    buildSuggestionEmbed
};
