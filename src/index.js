const { Client, GatewayIntentBits, Collection } = require("discord.js");

const config = require("./config");
const { loadSlashCommands, loadLegacyCommands } = require("./utils/loadCommands");


// ==============================
// SETUP CLIENT
// ==============================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildScheduledEvents
    ]
});

client.slashCommands = loadSlashCommands();
client.legacyCommands = loadLegacyCommands();

// Menyimpan role target reminder per scheduled event ID (lihat
// commands/createEvent.js & events/guildScheduledEventCreate.js)
client.eventReminderRoles = new Map();


// ==============================
// LOAD EVENT HANDLERS
// ==============================

const fs = require("fs");
const path = require("path");

const eventsDir = path.join(__dirname, "events");

const eventFiles = fs
    .readdirSync(eventsDir)
    .filter(file => file.endsWith(".js"));

for (const file of eventFiles) {

    const event = require(path.join(eventsDir, file));

    if (!event?.name || !event?.execute) {

        console.warn(
            `⚠️ Event handler di ${file} tidak valid (butuh 'name' & 'execute'), dilewati.`
        );

        continue;
    }

    if (event.once) {

        client.once(event.name, (...args) => event.execute(...args, client));

    } else {

        client.on(event.name, (...args) => event.execute(...args, client));

    }
}


// ==============================
// LOGIN
// ==============================

client.login(config.token);
