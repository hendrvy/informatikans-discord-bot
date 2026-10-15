const { Events, MessageFlags } = require("discord.js");

const { handleHelpSelect } = require("../commands/help");


const name = Events.InteractionCreate;


async function execute(interaction, client) {

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
