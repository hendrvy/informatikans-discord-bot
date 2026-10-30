require("dotenv").config();


// ==============================
// WAJIB DIISI
// ==============================

const required = [
    "DISCORD_TOKEN",
    "CLIENT_ID",
    "GUILD_ID",
    "CHANNEL_ID",
    "JOOBLE_API_KEY"
];

for (const key of required) {

    if (!process.env[key]) {

        console.warn(
            `⚠️ Env var ${key} belum diisi di .env`
        );

    }

}


if (
    process.env.LOMBA_ENABLED !== "false" &&
    !process.env.LOMBA_CHANNEL_ID
) {

    console.warn(
        "⚠️ LOMBA_CHANNEL_ID belum diisi — lomba akan diposting " +
        "di channel yang sama dengan lowongan magang (CHANNEL_ID)."
    );
}


// ==============================
// PARSE DAFTAR CHANNEL ID (dipisah koma)
// ==============================

function parseIdList(value) {

    if (!value) {
        return [];
    }

    return value
        .split(",")
        .map(id => id.trim())
        .filter(Boolean);
}


// ==============================
// CONFIG
// ==============================

const config = {

    // Discord core
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,

    // Internship feature
    channelId: process.env.CHANNEL_ID,
    joobleApiKey: process.env.JOOBLE_API_KEY,
    postedJobsDbPath: process.env.POSTED_JOBS_DB_PATH,

    // Lomba IT feature (AI competition finder)
    lombaChannelId:
        process.env.LOMBA_CHANNEL_ID || process.env.CHANNEL_ID,
    geminiApiKey: process.env.GEMINI_API_KEY || null,
    lombaMaxAiCalls:
        Number(process.env.LOMBA_MAX_AI_CALLS) || 25,
    lombaEnabled: process.env.LOMBA_ENABLED !== "false",

    // Prefix commands
    prefix: process.env.PREFIX || "$",

    // Autorole
    autoroleChannelIds: parseIdList(
        process.env.AUTOROLE_CHANNEL_IDS
    ),
    autoroleRoleName:
        process.env.AUTOROLE_ROLE_NAME || "Informatikans",

    // Event reminder
    eventAnnounceChannelId:
        process.env.EVENT_ANNOUNCE_CHANNEL_ID || process.env.CHANNEL_ID,

    // Saran member (/saran). Default: channel khusus saran komunitas.
    suggestionChannelId:
        process.env.SUGGESTION_CHANNEL_ID || "1561626479140278302",

    // Monitoring: user Discord yang menerima DM alert kritikal
    // (scraper rusak, alert channel gagal). Kosongkan untuk menonaktifkan.
    adminUserId: process.env.ADMIN_USER_ID || null,

    // Auto-deploy webhook (opsional). Kosongkan WEBHOOK_SECRET untuk
    // melewati verifikasi signature.
    //
    // Pterodactyl membagikan port alokasinya lewat SERVER_PORT, jadi itu
    // yang diprioritaskan sebelum jatuh ke WEBHOOK_PORT manual.
    webhookPort:
        process.env.SERVER_PORT ||
        process.env.PORT ||
        process.env.WEBHOOK_PORT ||
        9000,
    webhookPath: process.env.WEBHOOK_PATH || "/webhook",
    webhookSecret: process.env.WEBHOOK_SECRET || null,
    webhookBranch: process.env.WEBHOOK_BRANCH || "main"

};


module.exports = config;
