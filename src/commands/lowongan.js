const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { getRecentJobs } = require("../services/store");
const { JOB_CATEGORIES } = require("../services/jobCategory");


const data = new SlashCommandBuilder()
    .setName("lowongan")
    .setDescription("Lihat arsip lowongan magang yang sudah diposting bot")
    .addStringOption(option =>
        option
            .setName("kategori")
            .setDescription("Filter berdasarkan kategori")
            .setRequired(false)
            .addChoices(
                ...JOB_CATEGORIES.map(category => ({
                    name: category.name,
                    value: category.name
                }))
            )
    )
    .addStringOption(option =>
        option
            .setName("kata_kunci")
            .setDescription("Cari kata kunci di judul/perusahaan (mis. 'react')")
            .setRequired(false)
    )
    .addIntegerOption(option =>
        option
            .setName("jumlah")
            .setDescription("Jumlah lowongan yang ditampilkan (1-10, default 5)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(10)
    );


// ==============================
// EXECUTE
// ==============================

async function execute(interaction) {

    const category = interaction.options.getString("kategori");

    const keyword = interaction.options.getString("kata_kunci");

    const limit = interaction.options.getInteger("jumlah") ?? 5;

    await interaction.deferReply();

    try {

        const jobs = getRecentJobs({ limit, category, keyword });

        if (jobs.length === 0) {

            await interaction.editReply(
                "📭 Belum ada lowongan yang cocok di arsip. " +
                "Coba hapus filter, atau tunggu bot memposting lowongan baru."
            );

            return;
        }

        const description = jobs
            .map((job, index) => {

                const title = job.title || "Lowongan magang";

                const company = job.company ? ` — ${job.company}` : "";

                const date = job.posted_at
                    ? new Date(job.posted_at).toLocaleDateString(
                        "id-ID",
                        { day: "numeric", month: "short" }
                    )
                    : "";

                const meta = [
                    job.category ?? null,
                    job.location ?? null,
                    date ? `📅 ${date}` : null
                ].filter(Boolean).join(" • ");

                const heading = job.link
                    ? `${index + 1}. [**${title}**](${job.link})${company}`
                    : `${index + 1}. **${title}**${company}`;

                return meta
                    ? `${heading}\n   ${meta}`
                    : heading;
            })
            .join("\n");

        const embed = new EmbedBuilder()

            .setTitle("📚 Arsip Lowongan Magang")

            .setDescription(description)

            .setColor(0x5865f2)

            .setFooter({
                text: `${jobs.length} lowongan • Klik judul untuk membuka lowongan`
            })

            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {

        console.error("Gagal menjalankan /lowongan:", error.message);

        await interaction.editReply(
            "❌ Gagal mengambil arsip lowongan. Coba lagi nanti ya!"
        );
    }
}


module.exports = {
    data,
    execute
};
