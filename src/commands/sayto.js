const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags
} = require("discord.js");


// ==============================
// /sayto <channel> <pesan>
// Bot mengirim teks + attachment ke channel lain.
// Dibatasi khusus Administrator untuk mencegah penyalahgunaan.
// ==============================

const data = new SlashCommandBuilder()
    .setName("sayto")
    .setDescription("Bot mengirim pesan kamu ke channel lain")
    .addChannelOption(option =>
        option
            .setName("channel")
            .setDescription("Channel tujuan")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("pesan")
            .setDescription("Teks yang akan dikirim bot")
            .setRequired(false)
    )
    .addAttachmentOption(option =>
        option
            .setName("file")
            .setDescription("File/gambar yang akan dikirim (opsional)")
            .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);


async function execute(interaction) {

    const targetChannel = interaction.options.getChannel("channel");

    const pesan = interaction.options.getString("pesan");

    const file = interaction.options.getAttachment("file");

    const files = file ? [file] : [];

    if (!pesan && files.length === 0) {

        await interaction.reply({
            content: "Kamu harus kasih teks atau upload file/gambar.",
            flags: MessageFlags.Ephemeral
        });

        return;
    }

    // Cek izin bot di channel tujuan dulu supaya error-nya jelas.

    const perms = targetChannel.permissionsFor(interaction.guild.members.me);

    if (!perms?.has(PermissionFlagsBits.ViewChannel) ||
        !perms?.has(PermissionFlagsBits.SendMessages)) {

        await interaction.reply({
            content:
                "❌ Bot tidak punya izin **View Channel / Send Messages** " +
                `di ${targetChannel}. Beri izin ke role **Bot** di channel itu dulu.`,
            flags: MessageFlags.Ephemeral
        });

        return;
    }

    try {

        await targetChannel.send({
            content: pesan ?? undefined,
            files
        });

    } catch (error) {

        console.error(
            `❌ /sayto gagal kirim ke #${targetChannel.name}:`,
            error.code,
            error.message
        );

        await interaction.reply({
            content:
                `❌ Gagal kirim pesan ke ${targetChannel} ` +
                `(\`${error.code} ${error.message}\`).`,
            flags: MessageFlags.Ephemeral
        });

        return;
    }

    await interaction.reply({
        content: `✅ Pesan terkirim ke ${targetChannel.toString()}`,
        flags: MessageFlags.Ephemeral
    });
}


module.exports = {
    data,
    execute
};
