const { Events, MessageFlags } = require("discord.js");


const name = Events.InteractionCreate;


async function execute(interaction, client) {

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
