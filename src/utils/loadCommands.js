const fs = require("fs");
const path = require("path");
const { Collection } = require("discord.js");


// ==============================
// LOAD SLASH COMMANDS
// ==============================
// Setiap file di src/commands/ harus export { data, execute }

function loadSlashCommands() {

    const commands = new Collection();

    const commandsDir = path.join(__dirname, "..", "commands");

    const files = fs
        .readdirSync(commandsDir)
        .filter(file => file.endsWith(".js"));

    for (const file of files) {

        const command = require(
            path.join(commandsDir, file)
        );

        if (!command?.data || !command?.execute) {

            console.warn(
                `⚠️ Slash command di ${file} tidak valid (butuh 'data' & 'execute'), dilewati.`
            );

            continue;
        }

        commands.set(command.data.name, command);
    }

    return commands;
}


// ==============================
// LOAD LEGACY PREFIX COMMANDS
// ==============================
// Setiap file di src/legacyCommands/ harus export { name, execute }

function loadLegacyCommands() {

    const commands = new Collection();

    const commandsDir = path.join(__dirname, "..", "legacyCommands");

    const files = fs
        .readdirSync(commandsDir)
        .filter(file => file.endsWith(".js"));

    for (const file of files) {

        const command = require(
            path.join(commandsDir, file)
        );

        if (!command?.name || !command?.execute) {

            console.warn(
                `⚠️ Legacy command di ${file} tidak valid (butuh 'name' & 'execute'), dilewati.`
            );

            continue;
        }

        commands.set(command.name, command);
    }

    return commands;
}


module.exports = {
    loadSlashCommands,
    loadLegacyCommands
};
