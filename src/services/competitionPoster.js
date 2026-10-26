// ==============================
// POSTER LOMBA (EMBED + TOMBOL)
// ==============================
//
// Replika jobPoster.js untuk lomba IT. Alur per lomba:
// 1. Simpan ke competitions_archive (dapat archiveId).
// 2. Bangun embed (🎓 target, 💸 biaya, ⏰ deadline, dst).
// 3. Tombol "🔗 Daftar Sekarang" (link) + "🔔 Ingatkan saya"
//    (customId: lombrem:<archiveId>).
// 4. Tandai sudah diposting di posted_competitions.

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const { isAlreadyPosted, savePostedCompetition } =
    require("./competitionDuplicateChecker");

const { saveCompetitionArchive } = require("./store");


// Jeda antar posting agar tidak membanjiri channel.

const POST_DELAY_MS = 3000;

const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));


// ==============================
// FORMAT TANGGAL
// ==============================

function formatDate(date) {

    if (!date) {
        return "Tidak diketahui";
    }

    const parsedDate = new Date(date);

    if (isNaN(parsedDate.getTime())) {
        return date;
    }

    return parsedDate.toLocaleDateString(
        "id-ID",
        {
            day: "numeric",
            month: "long",
            year: "numeric"
        }
    );
}


// ==============================
// CREATE EMBED
// ==============================

function createCompetitionEmbed(competition) {

    const description =
        competition.description ||
        competition.snippet ||
        "";

    const embed = new EmbedBuilder()

        .setTitle("🏆 LOMBA IT BARU")

        .setDescription(
            `### 🎯 ${competition.title}` +
            (description
                ? `\n\n${description.substring(0, 300)}` +
                (description.length > 300 ? "..." : "")
                : "")
        )

        .addFields(
            {
                name: "🗂️ Kategori",
                value:
                    competition.category ||
                    "Teknologi Informasi",
                inline: true
            },
            {
                name: "🏢 Penyelenggara",
                value:
                    competition.organizer ||
                    "Tidak disebutkan",
                inline: true
            },
            {
                name: "🎓 Target",
                value:
                    competition.target ||
                    "Tidak disebutkan",
                inline: true
            },
            {
                name: "💸 Biaya",
                value:
                    competition.fee || "Tidak disebutkan",
                inline: true
            },
            {
                name: "📍 Lokasi",
                value:
                    competition.location ||
                    "Indonesia",
                inline: true
            },
            {
                name: "⏰ Deadline Pendaftaran",
                value: formatDate(competition.deadline),
                inline: true
            },
            {
                name: "📡 Sumber",
                value:
                    competition.source ||
                    "Tidak diketahui",
                inline: true
            }
        )

        .setColor(0x57f287)

        .setFooter({
            text:
                "Competition Alert • HMIF • ⚠️ Verifikasi info di " +
                "situs resmi sebelum mendaftar."
        })

        .setTimestamp();

    if (!competition.link && !competition.registrationLink) {

        embed.addFields({
            name: "🔗 Pendaftaran",
            value: "Link tidak tersedia"
        });
    }

    return embed;
}


// ==============================
// TOMBOL LINK + REMINDER
// ==============================

function buildCompetitionComponents(competition) {

    const rows = [];

    const actionRow = new ActionRowBuilder();

    // Link pendaftaran: utamakan link langsung hasil AI/konten,
    // fallback ke link halaman sumber.

    const registrationUrl =
        competition.registrationLink || competition.link;

    if (registrationUrl) {

        actionRow.addComponents(
            new ButtonBuilder()
                .setLabel("Daftar Sekarang")
                .setEmoji("🔗")
                .setStyle(ButtonStyle.Link)
                .setURL(registrationUrl)
        );
    }

    // Tombol "Ingatkan saya" — hanya kalau deadline valid & di masa
    // depan. competitionId disimpan di customId untuk handler tombol.

    const competitionId = competition.archiveId;

    const deadline = new Date(competition.deadline || "");

    if (
        competitionId &&
        !isNaN(deadline.getTime()) &&
        deadline.getTime() > Date.now()
    ) {

        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`lombrem:${competitionId}`)
                .setLabel("Ingatkan saya")
                .setEmoji("🔔")
                .setStyle(ButtonStyle.Secondary)
        );
    }

    if (actionRow.components.length > 0) {
        rows.push(actionRow);
    }

    return rows;
}


// ==============================
// POST LOMBA
// ==============================

async function postCompetition(channel, competition) {

    if (isAlreadyPosted(competition)) {

        console.log(
            `⏭️ Lomba sudah pernah dikirim: ${competition.title}`
        );

        return false;
    }

    // Simpan ke arsip dulu supaya tombol "🔔 Ingatkan saya" punya
    // competitionId yang bisa direferensikan.

    const archiveId = saveCompetitionArchive({
        link: competition.link,
        title: competition.title,
        organizer: competition.organizer,
        category: competition.category,
        fee: competition.fee,
        target: competition.target,
        location: competition.location,
        deadline: competition.deadline,
        source: competition.source
    });

    if (archiveId) {
        competition.archiveId = archiveId;
    }

    const embed =
        createCompetitionEmbed(competition);

    const components =
        buildCompetitionComponents(competition);

    await channel.send({
        embeds: [embed],
        components
    });

    savePostedCompetition(competition);

    console.log(
        `📤 Lomba berhasil dikirim: ${competition.title}`
    );

    // Jeda sebelum posting berikutnya (anti-spam)

    await sleep(POST_DELAY_MS);

    return true;
}


module.exports = {
    postCompetition,
    createCompetitionEmbed,
    buildCompetitionComponents,
    POST_DELAY_MS
};
