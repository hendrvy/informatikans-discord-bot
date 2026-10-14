const { EmbedBuilder } = require("discord.js");

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

    const embed =
        new EmbedBuilder()

            .setTitle(
                "🚀 MAGANG BARU"
            )

            .setDescription(
                `### 💼 ${
                    job.position ||
                    job.title
                }`
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
                    name: "📡 Sumber",
                    value:
                        formatSource(job),
                    inline: true
                },

                {
                    name: "🔗 Pendaftaran",
                    value:
                        job.link
                            ? `[Klik di sini untuk melamar 🚀](${job.link})`
                            : "Link tidak tersedia"
                }

            )

            .setFooter({
                text:
                    "Internship Alert • HMIF"
            })

            .setTimestamp();

    return embed;
}


// ==============================
// POST JOB
// ==============================

async function postJob(channel, job) {

    if (isAlreadyPosted(job)) {

        console.log(
            `⏭️ Sudah pernah dikirim: ${job.title}`
        );

        return false;
    }

    const embed =
        createJobEmbed(job);

    await channel.send({
        embeds: [embed]
    });

    savePostedJob(job);

    console.log(
        `📤 Berhasil dikirim: ${job.title}`
    );

    return true;
}


// ==============================
// EXPORT
// ==============================

module.exports = {
    postJob,
    createJobEmbed
};