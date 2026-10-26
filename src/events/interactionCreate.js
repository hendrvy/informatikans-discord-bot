const { Events, MessageFlags } = require("discord.js");

const { handleHelpSelect } = require("../commands/help");
const { handleJobRemindButton } = require("../services/jobReminder");
const { handleLombaRemindButton } = require("../services/competitionReminder");


const name = Events.InteractionCreate;


async function execute(interaction, client) {

    // Tombol "🔔 Ingatkan saya" di embed lowongan (customId: jobrem:<id>).

    if (interaction.isButton() &&
        interaction.customId.startsWith("jobrem:")) {

        try {

            await handleJobRemindButton(interaction);

        } catch (error) {

            console.error(
                "❌ Gagal memproses tombol reminder lowongan:",
                error.message
            );

            await interaction.reply({
                content: "❌ Gagal mendaftarkan pengingat. Coba lagi nanti ya!",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        return;
    }

    // Tombol "🔔 Ingatkan saya" di embed lomba (customId: lombrem:<id>).

    if (interaction.isButton() &&
        interaction.customId.startsWith("lombrem:")) {

        try {

            await handleLombaRemindButton(interaction);

        } catch (error) {

            console.error(
                "❌ Gagal memproses tombol reminder lomba:",
                error.message
            );

            await interaction.reply({
                content: "❌ Gagal mendaftarkan pengingat. Coba lagi nanti ya!",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        return;
    }

    // Select menu kategori help (customId: help_category).

    if (interaction.isStringSelectMenu() &&
        interaction.customId === "help_category") {

        try {

            await handleHelpSelect(interaction);

        } catch (error) {

            console.error(
                "❌ Gagal memproses menu help:",
                error.message
            );

            await interaction.reply({
                content: "❌ Terjadi error saat menampilkan kategori help.",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        return;
    }

    if (!interaction.isChatInputCommand()) {
        return;
    }

    const command = client.slashCommands.get(interaction.commandName);

    if (!command) {
        return;
    }

    try {

        await command.execute(interaction);

    } catch (error) {

        console.error(
            `❌ Gagal menjalankan command '/${interaction.commandName}':`,
            error.message
        );

        const errorReply = {
            content: "❌ Terjadi error saat menjalankan command ini.",
            flags: MessageFlags.Ephemeral
        };

        if (interaction.deferred || interaction.replied) {

            await interaction.followUp(errorReply).catch(() => {});

        } else {

            await interaction.reply(errorReply).catch(() => {});

        }

    }
}


module.exports = {
    name,
    execute
};
