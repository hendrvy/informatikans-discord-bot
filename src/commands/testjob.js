const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const { createJobEmbed } = require("../services/jobPoster");
const { getJobs } = require("../services/jobCollector");
const { isRelevantInternship } = require("../services/jobFilter");
const { getJobDetails } = require("../services/jobDetailCollector");
const { getJobCategory } = require("../services/jobCategory");


const data = new SlashCommandBuilder()
    .setName("testpost")
    .setDescription("Preview tampilan posting lowongan")
    .addStringOption(option =>
        option
            .setName("mode")
            .setDescription("Sumber preview")
            .setRequired(false)
            .addChoices(
                { name: "Dummy (contoh buatan)", value: "dummy" },
                { name: "Lowongan asli pertama yang relevan", value: "real" }
            )
    )
    .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
    );


function buildPreviewComponents(job) {

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


async function execute(interaction) {

    const mode = interaction.options.getString("mode") || "dummy";

    await interaction.deferReply();

    try {

        let job;

        if (mode === "real") {

            const jobs = await getJobs();

            for (const candidate of jobs) {

                if (!candidate.detailAvailable) {

                    if (isRelevantInternship(candidate)) {
                        job = candidate;
                        break;
                    }

                    continue;
                }

                const detailed = await getJobDetails(candidate);

                if (detailed && !detailed.isExpired && isRelevantInternship(detailed)) {
                    job = detailed;
                    break;
                }
            }

            if (!job) {

                await interaction.editReply(
                    "😔 Tidak ada lowongan asli yang relevan saat ini. Coba mode dummy."
                );

                return;
            }

        } else {

            job = {
                title: "Software Engineer Intern",
                position: "Software Engineer Intern",
                company: "PT Contoh Indonesia",
                location: "Jakarta, Indonesia (Hybrid)",

                summary:
                    "Kami mencari mahasiswa yang antusias untuk bergabung dengan tim engineering kami. " +
                    "Kamu akan ikut membangun fitur produk yang dipakai jutaan pengguna.",

                requirements:
                    "Mahasiswa aktif minimal semester 5\n" +
                    "Menguasai dasar JavaScript\n" +
                    "Memahami Git dan GitHub\n" +
                    "Bersedia bekerja secara hybrid",

                duration: "6 bulan",

                deadline: "September 30, 2026",
                postedDate: "Agustus 30, 2026",
                updated: null,
                source: "LinkedIn",
                originalSource: "",
                link: "https://www.linkedin.com/jobs/",
                snippet: ""
            };
        }

        const embed = createJobEmbed(job);

        const header =
            `🧪 **Preview posting** (${mode})\n` +
            `🗂️ Kategori terdeteksi: **${getJobCategory(job)}**\n`;

        await interaction.editReply({
            content: header,
            embeds: [embed],
            components: buildPreviewComponents(job)
        });

    } catch (error) {

        console.error("Gagal menjalankan /testpost:", error.message);

        await interaction.editReply(
            "❌ Gagal membuat preview: " + error.message
        );
    }
}


module.exports = {
    data,
    execute
};
