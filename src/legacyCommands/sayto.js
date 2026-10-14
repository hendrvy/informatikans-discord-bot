const { PermissionsBitField, ChannelType } = require("discord.js");


const name = "sayto";


// ==============================
// $sayto <#channel> <pesan>
// Bot mengirim teks + attachment ke channel lain.
// Dibatasi khusus Administrator untuk mencegah penyalahgunaan.
// ==============================

async function execute(message, args) {

    if (
        !message.member?.permissions.has(
            PermissionsBitField.Flags.Administrator
        )
    ) {

        await message.reply(
            "❌ Hanya Administrator yang dapat menggunakan command ini."
        );

        return;
    }

    const targetChannel = message.mentions.channels.first();

    if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {

        await message.reply(
            "Kamu harus mention channel tujuan yang valid. Contoh: `$sayto #general Halo semua!`"
        );

        return;
    }

    // Buang token mention channel dari args, sisanya jadi pesan
    const pesan =
        args.filter(arg => !arg.startsWith("<#")).join(" ") || null;

    const files = [...message.attachments.values()];

    if (!pesan && files.length === 0) {

        await message.reply(
            "Kamu harus kasih teks atau upload file/gambar."
        );

        return;
    }

    await targetChannel.send({
        content: pesan ?? undefined,
        files
    });

    await message.reply(
        `✅ Pesan terkirim ke ${targetChannel.toString()}`
    );
}


module.exports = {
    name,
    execute
};
