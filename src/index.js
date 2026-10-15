const { Client, GatewayIntentBits, Collection } = require("discord.js");

const config = require("./config");
const { loadSlashCommands, loadLegacyCommands } = require("./utils/loadCommands");
const { startAutoDeploy } = require("./autodeploy/listener");


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
// AUTO-DEPLOY WEBHOOK (opsional)
// ==============================
// Bisa dimatikan dengan set WEBHOOK_ENABLED=false di .env.

if (process.env.WEBHOOK_ENABLED !== "false") {
    startAutoDeploy();
}


// ==============================
// LOGIN
// ==============================

client.login(config.token);
