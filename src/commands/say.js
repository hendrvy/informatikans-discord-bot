const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags
} = require("discord.js");


// ==============================
// /say <pesan>
// Bot mengirim ulang teks + attachment yang di-attach user,
// lalu menghapus pesan slash command-nya (ephemeral).
// Dibatasi khusus Administrator untuk mencegah penyalahgunaan.
// ==============================

const data = new SlashCommandBuilder()
    .setName("say")
    .setDescription("Bot mengirim ulang pesan kamu di channel ini")
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

    const channel = interaction.channel;

    // Cek izin bot di channel ini dulu supaya error-nya jelas
    // (bukan cuma "Missing Access" yang membingungkan).

    const perms = channel.permissionsFor(interaction.guild.members.me);

    if (!perms?.has(PermissionFlagsBits.ViewChannel) ||
        !perms?.has(PermissionFlagsBits.SendMessages)) {

        await interaction.reply({
            content:
                "❌ Bot tidak punya izin **View Channel / Send Messages** " +
                `di ${channel}. Beri izin ke role **Bot** di channel itu dulu.`,
            flags: MessageFlags.Ephemeral
        });

        return;
    }

    try {

        await channel.send({
            content: pesan ?? undefined,
            files
        });

    } catch (error) {

        console.error(
            `❌ /say gagal kirim ke #${channel.name}:`,
            error.code,
            error.message
        );

        await interaction.reply({
            content:
                `❌ Gagal kirim pesan di ${channel} ` +
                `(\`${error.code} ${error.message}\`).`,
            flags: MessageFlags.Ephemeral
        });

        return;
    }

    await interaction.reply({
        content: "✅ Pesan terkirim.",
        flags: MessageFlags.Ephemeral
    });
}


module.exports = {
    data,
    execute
};
