const { SlashCommandBuilder } = require("discord.js");


const data = new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Cek latency bot");


async function execute(interaction) {

    await interaction.reply(
        `Pong! 🏓 \`${Math.round(interaction.client.ws.ping)}ms\``
    );
}


module.exports = {
    data,
    execute
};
