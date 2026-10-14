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
        process.env.EVENT_ANNOUNCE_CHANNEL_ID || process.env.CHANNEL_ID

};


module.exports = config;
