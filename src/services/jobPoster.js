const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const {
    isAlreadyPosted,
    savePostedJob
} = require("./duplicateChecker");

const { getJobCategory } = require("./jobCategory");


// ==============================
// MEMBERSIHKAN TEXT
// ==============================

function cleanText(text) {

    if (!text) {
        return "";
    }

    return text
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\r/g, "")
        .trim();
}


// ==============================
// FORMAT REQUIREMENTS
// ==============================

function formatRequirements(text) {

    if (!text) {
        return "Tidak disebutkan.";
    }

    let result = cleanText(text);

    result = result.replace(/^#{1,6}\s*/gm, "");

    result = result.replace(
        /(^|\n)\s*#\s*/g,
        "$1• "
    );

    result = result.replace(
        /(^|\n)\s*-\s+/g,
        "$1• "
    );

    // Pastikan setiap baris non-kosong diberi bullet point
    result = result
        .split("\n")
        .map(line => {
            line = line.trim();

            if (!line) {
                return "";
            }

            if (
                !line.startsWith("•") &&
                !line.endsWith(":")
            ) {
                return `• ${line}`;
            }

            return line;
        })
        .filter(Boolean)
        .join("\n");

    result = result.replace(
        /\n\s*\n+/g,
        "\n"
    );

    result = result.trim();

    if (result.length > 1200) {
        result =
            result.substring(0, 1197) + "...";
    }

    return result || "Tidak disebutkan.";
}


// ==============================
// FORMAT TANGGAL
// ==============================

function formatDate(date) {

    if (!date || date === "Tidak diketahui") {
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
// FORMAT SOURCE
// ==============================

function formatSource(job) {

    if (
        job.source === "Jooble" &&
        job.originalSource
    ) {
        return `Jooble • ${job.originalSource}`;
    }

    return (
        job.source ||
        "Tidak diketahui"
    );
}


// ==============================
// CREATE EMBED
// ==============================

function createJobEmbed(job) {

    const category =
        getJobCategory(job);

    const requirements =
        formatRequirements(
            job.requirements ||
            job.snippet
        );

    const summary =
        cleanText(
            job.summary || ""
        );

    const embed =
        new EmbedBuilder()

            .setTitle(
                "🚀 MAGANG BARU"
            )

            .setDescription(
                `### 💼 ${
                    job.position ||
                    job.title
                }` +
                (summary
                    ? `\n\n${summary.substring(0, 300)}${summary.length > 300 ? "..." : ""}`
                    : "")
            )

            .addFields(

                {
                    name: "🏢 Perusahaan",
                    value:
                        job.company ||
                        "Tidak disebutkan",
                    inline: true
                },

                {
                    name: "📍 Lokasi",
                    value:
                        job.location ||
                        "Tidak disebutkan",
                    inline: true
                },

                {
                    name: "🗂️ Kategori",
                    value:
                        category ||
                        "IT",
                    inline: true
                },

                {
                    name: "📋 Persyaratan",
                    value: requirements
                },

                {
                    name: "⏰ Deadline",
                    value:
                        formatDate(
                            job.deadline
                        ),
                    inline: true
                },

                {
                    name: "📅 Dipublikasikan",
                    value:
                        formatDate(
                            job.updated ||
                            job.postedDate
                        ),
                    inline: true
                },

                {
                    name: "⏳ Durasi",
                    value:
                        job.duration ||
                        "Tidak disebutkan",
                    inline: true
                },

                {
                    name: "📡 Sumber",
                    value:
                        formatSource(job),
                    inline: true
                }

            )

            .setFooter({
                text:
                    "Internship Alert • HMIF • ⚠️ Verifikasi keaslian lowongan sebelum melamar. Kami tidak bertanggung jawab atas penipuan."
            })

            .setTimestamp();

    // Link pendaftaran jadi tombol di bawah embed (lihat
    // buildJobComponents). Kalau tidak ada link, tampilkan
    // sebagai field biasa.

    if (!job.link) {

        embed.addFields({
            name: "🔗 Pendaftaran",
            value: "Link tidak tersedia"
        });
    }

    return embed;
}


// ==============================
// TOMBOL LINK
// ==============================

function buildJobComponents(job) {

    if (!job.link) {
        return [];
    }

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(" Lamar Sekarang")
                .setStyle(ButtonStyle.Link)
                .setURL(job.link)
        )
    ];
}


// ==============================
// POST JOB
// ==============================

// Jeda antar posting agar tidak membanjiri channel kalau
// ada banyak lowongan baru sekaligus.

const POST_DELAY_MS = 3000;

const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

async function postJob(channel, job) {

    if (isAlreadyPosted(job)) {

        console.log(
            `⏭️ Sudah pernah dikirim: ${job.title}`
        );

        return false;
    }

    const embed =
        createJobEmbed(job);

    const components =
        buildJobComponents(job);

    await channel.send({
        embeds: [embed],
        components
    });

    savePostedJob(job);

    console.log(
        `📤 Berhasil dikirim: ${job.title}`
    );

    // Jeda sebelum posting berikutnya (anti-spam)

    await sleep(POST_DELAY_MS);

    return true;
}


// ==============================
// EXPORT
// ==============================

module.exports = {
    postJob,
    createJobEmbed,
    buildJobComponents
};