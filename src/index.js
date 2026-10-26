const { Client, GatewayIntentBits, Collection } = require("discord.js");

const config = require("./config");
const { loadSlashCommands, loadLegacyCommands } = require("./utils/loadCommands");
const {
    startAutoDeploy,
    stopAutoDeploy,
    setReadyCheck
} = require("./autodeploy/listener");


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

    // Supaya /health bisa melaporkan bot benar-benar sudah connect ke
    // Discord, bukan cuma prosesnya hidup.
    setReadyCheck(() => client.isReady());

    startAutoDeploy();
}


// ==============================
// GRACEFUL SHUTDOWN
// ==============================
//
// Supervisor (deploy.js) mengirim SIGTERM saat mau me-restart bot dengan
// kode baru. Tanpa handler ini prosesnya di-SIGKILL, dan SIGKILL di
// tengah write SQLite (mode WAL) itu persis skenario yang membuat
// database corrupt. Jadi: lepas port, disconnect gateway, tutup DB.

let shuttingDown = false;

async function shutdown(signal) {

    if (shuttingDown) return;

    shuttingDown = true;

    console.log(`[shutdown] menerima ${signal}, menutup dengan rapi...`);

    // Jaring pengaman: kalau ada langkah yang menggantung, jangan sampai
    // supervisor harus SIGKILL kita.
    const failsafe = setTimeout(() => {
        console.warn("[shutdown] timeout, keluar paksa.");
        process.exit(0);
    }, 8000);

    failsafe.unref();

    try {
        await stopAutoDeploy();
    } catch (error) {
        console.error("[shutdown] gagal menutup listener:", error.message);
    }

    try {
        await client.destroy();
    } catch (error) {
        console.error("[shutdown] gagal menutup Discord client:", error.message);
    }

    // Tiga modul ini memegang handle SQLite masing-masing.
    for (const modulePath of [
        "./services/store",
        "./services/duplicateChecker",
        "./services/competitionDuplicateChecker"
    ]) {
        try {
            require(modulePath).closeDb();
        } catch (error) {
            console.error(
                `[shutdown] gagal menutup database (${modulePath}):`,
                error.message
            );
        }
    }

    console.log("[shutdown] selesai.");

    clearTimeout(failsafe);

    process.exit(0);
}

for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => shutdown(signal));
}


// ==============================
// LOGIN
// ==============================

client.login(config.token);
