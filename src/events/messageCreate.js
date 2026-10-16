const { Events } = require("discord.js");

const config = require("../config");
const { parseAngkatan } = require("../utils/parseAngkatan");


const name = Events.MessageCreate;


// Kata kunci yang wajib ada semua di pesan perkenalan agar terdeteksi.
// "panggilan" (bukan "nama panggilan") supaya member yang menulis
// "Panggilan: X" tanpa kata "Nama" di depannya tetap terdeteksi.
const INTRO_FORMAT_KEYWORDS = [
    "nama",
    "panggilan",
    "angkatan",
    "hobi",
    "minat"
];


// ==============================
// EXTRACT NAMA PANGGILAN DARI PESAN PERKENALAN
// ==============================

function extractNickname(messageContent) {

    const lines = messageContent.split("\n");

    for (const line of lines) {

        const [label, ...rest] = line.split(":");

        if (label && label.toLowerCase().includes("panggilan")) {

            const value = rest.join(":").trim();

            return value || null;
        }
    }

    return null;
}


// ==============================
// HANDLE AUTOROLE (deteksi format perkenalan)
// ==============================

async function handleAutorole(message) {

    if (config.autoroleChannelIds.length === 0) {
        return;
    }

    if (!config.autoroleChannelIds.includes(message.channel.id)) {
        return;
    }

    const content = message.content.toLowerCase();

    const isIntroFormat = INTRO_FORMAT_KEYWORDS.every(keyword =>
        content.includes(keyword)
    );

    if (!isIntroFormat) {
        return;
    }

    const nickname = extractNickname(message.content);

    await message.react("👋").catch(() => {});

    await message.channel.send(
        `${message.author} Salam kenal, ${
            nickname ? titleCase(nickname) : message.author.username
        }! Selamat bergabung di Informatikans!`
    );

    // ===== Role utama (Informatikans) =====
    const mainRole = message.guild.roles.cache.find(
        role => role.name === config.autoroleRoleName
    );

    if (mainRole) {

        await message.member?.roles.add(mainRole).catch(error => {

            console.error(
                `Gagal assign role '${config.autoroleRoleName}':`,
                error.message
            );

        });

    } else {

        console.warn(
            `⚠️ Role '${config.autoroleRoleName}' tidak ditemukan di server, dilewati.`
        );

    }

    // ===== Role angkatan (Akt'XX), dibuat otomatis jika belum ada =====
    const angkatanRoleName = parseAngkatan(message.content);

    if (!angkatanRoleName) {

        console.warn(
            "⚠️ Format angkatan tidak terdeteksi/valid pada pesan perkenalan, role angkatan dilewati."
        );

        return;
    }

    let angkatanRole = message.guild.roles.cache.find(
        role => role.name === angkatanRoleName
    );

    if (!angkatanRole) {

        try {

            angkatanRole = await message.guild.roles.create({
                name: angkatanRoleName,
                reason: "Dibuat otomatis oleh autorole (role angkatan belum ada)"
            });

            console.log(`✅ Role '${angkatanRoleName}' dibuat otomatis.`);

        } catch (error) {

            console.error(
                `Gagal membuat role '${angkatanRoleName}':`,
                error.message
            );

            return;
        }
    }

    await message.member?.roles.add(angkatanRole).catch(error => {

        console.error(
            `Gagal assign role '${angkatanRoleName}':`,
            error.message
        );

    });

}


function titleCase(text) {

    return text
        .trim()
        .toLowerCase()
        .split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}


// ==============================
// HANDLE LEGACY PREFIX COMMAND
// ==============================

async function handlePrefixCommand(message, legacyCommands) {

    if (!message.content.startsWith(config.prefix)) {
        return;
    }

    const args = message.content
        .slice(config.prefix.length)
        .trim()
        .split(/\s+/);

    const commandName = args.shift()?.toLowerCase();

    if (!commandName) {
        return;
    }

    const command = legacyCommands.get(commandName);

    if (!command) {
        return;
    }

    try {

        await command.execute(message, args);

    } catch (error) {

        console.error(
            `Gagal menjalankan command '$${commandName}':`,
            error.message
        );

        await message.reply(
            "❌ Terjadi error saat menjalankan command."
        ).catch(() => {});

    }
}


async function execute(message, client) {

    if (message.author.bot) {
        return;
    }

    if (!message.guild) {
        return;
    }

    await handleAutorole(message);

    await handlePrefixCommand(message, client.legacyCommands);
}


module.exports = {
    name,
    execute
};
