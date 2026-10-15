const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { deleteEventReminderRole } = require("../services/store");


const data = new SlashCommandBuilder()
    .setName("delete_event")
    .setDescription("Menghapus scheduled event")
    .setDefaultMemberPermissions(
        PermissionFlagsBits.ManageEvents
    )
    .addStringOption(option =>
        option
            .setName("event_id")
            .setDescription("ID dari scheduled event yang akan dihapus")
            .setRequired(true)
    );


async function execute(interaction) {

    const eventId = interaction.options.getString("event_id", true);

    await interaction.deferReply();

    try {

        const event = await interaction.guild.scheduledEvents.fetch(eventId);

        if (!event) {

            await interaction.editReply("❌ Event tidak ditemukan.");
            return;
        }

        const eventName = event.name;

        await event.delete();

        deleteEventReminderRole(eventId);

        await interaction.editReply(
            `✅ Event '${eventName}' berhasil dihapus.`
        );

    } catch (error) {

        console.error("Gagal menghapus event:", error.message);

        await interaction.editReply(
            `❌ Gagal menghapus event: ${error.message}`
        );

    }
}


module.exports = {
    data,
    execute
};
