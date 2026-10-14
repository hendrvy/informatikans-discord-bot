const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { getJobs } = require("../services/jobCollector");
const { isRelevantInternship } = require("../services/jobFilter");
const { JOB_CATEGORIES, getJobCategory } = require("../services/jobCategory");
const { getJobDetails } = require("../services/jobDetailCollector");

const MAX_RESULTS = 10;

// Maksimal kandidat yang detailnya di-scrape per pencarian.
// Semakin besar semakin lama command menunggu.

const MAX_DETAIL_FETCH = 30;

const data = new SlashCommandBuilder()
    .setName("cari")
    .setDescription("Cari lowongan magang IT dari semua sumber")
    .addStringOption(option =>
        option
            .setName("kata_kunci")
            .setDescription("Kata kunci, misal: python, react, GIZ")
            .setRequired(false)
    )
    .addStringOption(option =>
        option
            .setName("kategori")
            .setDescription("Kategori lowongan")
            .setRequired(false)
            .addChoices(
                JOB_CATEGORIES.map(category => ({
                    name: category.name,
                    value: category.name.toLowerCase()
                }))
            )
    )
    .addStringOption(option =>
        option
            .setName("lokasi")
            .setDescription("Lokasi, misal: Jakarta, Bandung, Remote")
            .setRequired(false)
    )
    .addStringOption(option =>
        option
            .setName("sumber")
            .setDescription("Sumber lowongan")
            .setRequired(false)
            .addChoices(
                { name: "Semua", value: "semua" },
                { name: "Jooble", value: "jooble" },
                { name: "DevJobsIndo", value: "devjobsindo" },
                { name: "Kalibrr", value: "kalibrr" }
            )
    );

function matchesKeyword(job, keyword) {

    if (!keyword) {
        return true;
    }

    const haystack = [
        job.title,
        job.position,
        job.company,
        job.location,
        job.snippet,
        job.summary
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return keyword
        .toLowerCase()
        .split(/\s+/)
        .every(word => haystack.includes(word));
}

function matchesCategory(job, categoryFilter) {

    if (!categoryFilter) {
        return true;
    }

    const category = getJobCategory(job).toLowerCase();

    return category.includes(categoryFilter.toLowerCase());
}

function matchesLocation(job, locationFilter) {

    if (!locationFilter) {
        return true;
    }

    const location = (job.location || "").toLowerCase();

    return location.includes(locationFilter.toLowerCase());
}

function formatResultField(job, index) {

    const parts = [];

    if (job.company) {
        parts.push(`🏢 ${job.company}`);
    }

    if (job.location) {
        parts.push(`📍 ${job.location}`);
    }

    if (job.deadline && job.deadline !== "Tidak diketahui") {
        parts.push(`⏰ ${job.deadline}`);
    }

    parts.push(`🗂️ ${getJobCategory(job)}`);
    parts.push(`🔗 [Lamar di sini](${job.link})`);

    return {
        name: `${index}. ${job.title}`.substring(0, 256),
        value: parts.join("\n").substring(0, 1024)
    };
}

async function execute(interaction) {

    const keyword = interaction.options.getString("kata_kunci");
    const categoryFilter = interaction.options.getString("kategori");
    const locationFilter = interaction.options.getString("lokasi");
    const source = interaction.options.getString("sumber") || "semua";

    // Scraping butuh beberapa detik, jadi pakai defer

    await interaction.deferReply();

    try {

        let jobs = await getJobs();

        if (source !== "semua") {

            jobs = jobs.filter(
                job => job.source.toLowerCase() === source
            );
        }

        // Filter kategori & lokasi bisa diterapkan lebih awal
        // untuk mempersempit kandidat sebelum detail diambil.

        if (categoryFilter) {
            jobs = jobs.filter(job => matchesCategory(job, categoryFilter));
        }

        if (locationFilter) {
            jobs = jobs.filter(job => matchesLocation(job, locationFilter));
        }

        // Hilangkan duplikat berdasarkan link

        const seen = new Set();
        jobs = jobs.filter(job => {

            if (!job.link || seen.has(job.link)) {
                return false;
            }

            seen.add(job.link);
            return true;
        });

        // Ambil detail dulu (info tech keyword, perusahaan, lokasi,
        // dan deadline baru lengkap setelah detail di-scrape),
        // lalu saring.

        const detailJobs = [];

        for (const job of jobs.slice(0, MAX_DETAIL_FETCH)) {

            if (!job.detailAvailable) {

                if (keyword) {

                    if (matchesKeyword(job, keyword)) {
                        detailJobs.push(job);
                    }

                } else if (isRelevantInternship(job)) {

                    detailJobs.push(job);
                }

                continue;
            }

            const detailed = await getJobDetails(job);

            if (!detailed || detailed.isExpired) {
                continue;
            }

            if (keyword) {

                if (matchesKeyword(detailed, keyword)) {
                    detailJobs.push(detailed);
                }

            } else if (isRelevantInternship(detailed)) {

                detailJobs.push(detailed);
            }

            if (detailJobs.length >= MAX_RESULTS) {
                break;
            }
        }

        if (detailJobs.length === 0) {

            const filters = [
                keyword ? `kata kunci \`${keyword}\`` : null,
                categoryFilter ? `kategori \`${categoryFilter}\`` : null,
                locationFilter ? `lokasi \`${locationFilter}\`` : null
            ]
                .filter(Boolean)
                .join(", ");

            await interaction.editReply(
                `😔 Tidak ada lowongan yang cocok${
                    filters ? ` untuk ${filters}` : ""
                }. Coba filter lain ya!`
            );

            return;
        }

        const results = detailJobs
            .map((job, index) => formatResultField(job, index + 1));

        const activeFilters = [
            keyword ? `🔑 \`${keyword}\`` : null,
            categoryFilter ? `🗂️ \`${categoryFilter}\`` : null,
            locationFilter ? `📍 \`${locationFilter}\`` : null,
            source !== "semua" ? `📡 ${source}` : null
        ]
            .filter(Boolean)
            .join(" • ");

        const embed = new EmbedBuilder()

            .setTitle(
                `🔍 Hasil pencarian lowongan${
                    keyword ? `: ${keyword}` : ""
                }`
            )

            .setDescription(
                `Ditemukan **${detailJobs.length}** lowongan aktif` +
                (detailJobs.length >= MAX_RESULTS
                    ? ` (menampilkan ${MAX_RESULTS} teratas)`
                    : "") +
                (activeFilters ? `\n\`${activeFilters}\`` : "")
            )

            .addFields(results)

            .setFooter({
                text: "Internship Alert • HMIF • ⚠️ Verifikasi info di link resmi sebelum melamar. Kami tidak bertanggung jawab atas penipuan."
            })

            .setTimestamp();

        await interaction.editReply({
            embeds: [embed]
        });

    } catch (error) {

        console.error("Gagal menjalankan /cari:", error.message);

        const payload = {
            content: "❌ Gagal mengambil lowongan. Coba lagi nanti ya!",
            ephemeral: true
        };

        if (interaction.deferred) {
            await interaction.editReply({
                content: payload.content
            });
        } else {
            await interaction.reply(payload);
        }
    }
}

module.exports = {
    data,
    execute
};
