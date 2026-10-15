const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    GuildScheduledEventEntityType,
    GuildScheduledEventPrivacyLevel
} = require("discord.js");

const { parseJakartaDateTime } = require("../utils/time");
const { setEventReminderRole } = require("../services/store");


const data = new SlashCommandBuilder()
    .setName("create_event")
    .setDescription("Membuat scheduled event di server")
    .setDefaultMemberPermissions(
        PermissionFlagsBits.ManageEvents
    )
    .addStringOption(option =>
        option
            .setName("name")
            .setDescription("Nama event")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("desc")
            .setDescription("Deskripsi event")
            .setRequired(true)
    )
    .addChannelOption(option =>
        option
            .setName("channel")
            .setDescription("Voice/Stage channel lokasi event")
            .addChannelTypes(
                ChannelType.GuildVoice,
                ChannelType.GuildStageVoice
            )
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("start_time")
            .setDescription("Waktu mulai, format DD-MM-YYYY HH:MM (WIB)")
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName("end_time")
            .setDescription("Waktu selesai, format DD-MM-YYYY HH:MM (WIB)")
            .setRequired(true)
    )
    .addRoleOption(option =>
        option
            .setName("role")
            .setDescription("Role yang akan di-ping saat reminder (default: @everyone)")
            .setRequired(false)
    )
    .addStringOption(option =>
        option
            .setName("image")
            .setDescription("URL gambar cover event")
            .setRequired(false)
    );


async function execute(interaction) {

    const name = interaction.options.getString("name", true);
    const desc = interaction.options.getString("desc", true);
    const channel = interaction.options.getChannel("channel", true);
    const startTimeText = interaction.options.getString("start_time", true);
    const endTimeText = interaction.options.getString("end_time", true);
    const role = interaction.options.getRole("role");
    const imageUrl = interaction.options.getString("image");

    const startTime = parseJakartaDateTime(startTimeText);
    const endTime = parseJakartaDateTime(endTimeText);

    if (!startTime || !endTime) {

        await interaction.reply({
            content: "❌ Format tanggal tidak valid. Gunakan DD-MM-YYYY HH:MM (contoh: 25-12-2026 19:00).",
            ephemeral: true
        });

        return;
    }

    if (endTime <= startTime) {

        await interaction.reply({
            content: "❌ Waktu selesai harus setelah waktu mulai.",
            ephemeral: true
        });

        return;
    }

    const entityType =
        channel.type === ChannelType.GuildStageVoice
            ? GuildScheduledEventEntityType.StageInstance
            : GuildScheduledEventEntityType.Voice;

    try {

        const event = await interaction.guild.scheduledEvents.create({
            name,
            description: desc,
            scheduledStartTime: startTime,
            scheduledEndTime: endTime,
            privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
            entityType,
            channel: channel.id,
            image: imageUrl || undefined,
            reason: `Dibuat oleh ${interaction.user.tag} via /create_event`
        });

        // Simpan role target reminder di SQLite (persisten antar restart,
        // dibaca lagi oleh events/guildScheduledEventCreate.js).
        setEventReminderRole(event.id, role?.id ?? null);

        await interaction.reply(
            `✅ Event berhasil dibuat! [Klik untuk lihat](${event.url})`
        );

    } catch (error) {

        console.error("Gagal membuat event:", error.message);

        await interaction.reply({
            content: `❌ Gagal membuat event: ${error.message}`,
            ephemeral: true
        });

    }
}


module.exports = {
    data,
    execute
};
