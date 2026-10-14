const { PermissionsBitField } = require("discord.js");


const name = "say";


// ==============================
// $say <pesan>
// Bot mengirim ulang teks + attachment yang di-attach user.
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

    const pesan = args.join(" ") || null;
    const files = [...message.attachments.values()];

    if (!pesan && files.length === 0) {

        await message.reply(
            "Kamu harus kasih teks atau upload file/gambar."
        );

        return;
    }

    await message.channel.send({
        content: pesan ?? undefined,
        files
    });

    // Hapus command asli supaya rapi (abaikan jika gagal, misal tanpa permission)
    await message.delete().catch(() => {});
}


module.exports = {
    name,
    execute
};
