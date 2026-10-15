const { Events, MessageFlags } = require("discord.js");

const { ROLEPANEL_SELECT_ID } = require("../commands/rolepanel");
const { handleRpsButton } = require("../commands/rps");
const { handleTriviaButton } = require("../commands/trivia");
const { handleHelpSelect } = require("../commands/help");


const name = Events.InteractionCreate;


// ==============================
// HANDLE ROLE PANEL SELECT MENU
// ==============================
// Toggle role: pilih = ambil role, hapus pilihan = lepas role.

async function handleRolePanelSelect(interaction) {

    const selectedRoleIds = interaction.values;

    const member = interaction.member;

    const added = [];
    const removed = [];
    const failed = [];

    for (const roleId of selectedRoleIds) {

        const role = interaction.guild.roles.cache.get(roleId);

        if (!role) {
            failed.push(roleId);
            continue;
        }

        try {

            if (member.roles.cache.has(roleId)) {

                await member.roles.remove(roleId);
                removed.push(role.name);

            } else {

                await member.roles.add(roleId);
                added.push(role.name);
            }

        } catch (error) {

            console.error(
                `Gagal toggle role '${role.name}' untuk ${member.user.tag}:`,
                error.message
            );

            failed.push(role.name);
        }
    }

    const parts = [];

    if (added.length > 0) {
        parts.push(`✅ Role didapat: ${added.join(", ")}`);
    }

    if (removed.length > 0) {
        parts.push(`🔓 Role dilepas: ${removed.join(", ")}`);
    }

    if (failed.length > 0) {
        parts.push(`❌ Gagal memproses: ${failed.join(", ")}`);
    }

    await interaction.reply({
        content: parts.join("\n") || "Tidak ada perubahan role.",
        ephemeral: true
    });
}


async function execute(interaction, client) {

    // Tombol jawaban trivia (customId format: trivia:<index>).

    if (interaction.isButton() &&
        interaction.customId.startsWith("trivia:")) {

        const handled = handleTriviaButton(interaction);

        if (!handled) {

            await interaction.reply({
                content: "Sesi trivia ini sudah berakhir. Mulai soal baru dengan `/trivia` ya!",
                ephemeral: true
            }).catch(() => {});
        }

        return;
    }

    // Tombol game RPS (customId format: rps:<choice>).

    if (interaction.isButton() &&
        interaction.customId.startsWith("rps:")) {

        const handled = handleRpsButton(interaction);

        if (!handled) {

            await interaction.reply({
                content: "Game ini sudah berakhir atau tidak valid. Mulai game baru dengan `/rps` ya!",
                ephemeral: true
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

    // Select menu dari /rolepanel (bukan chat input command).

    if (interaction.isStringSelectMenu() &&
        interaction.customId === ROLEPANEL_SELECT_ID) {

        try {

            await handleRolePanelSelect(interaction);

        } catch (error) {

            console.error(
                "❌ Gagal memproses role panel:",
                error.message
            );

            await interaction.reply({
                content: "❌ Terjadi error saat memproses pilihan role.",
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
