const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const {
    createCompetitionEmbed
} = require("../services/competitionPoster");
const { getCompetitions } = require("../services/competitionCollector");
const {
    isRelevantCompetition,
    getMahasiswaScore
} = require("../services/competitionFilter");
const {
    enrichCompetition
} = require("../services/aiEnricher");
const { isAlreadyPosted } = require("../services/competitionDuplicateChecker");


const data = new SlashCommandBuilder()
    .setName("testlomba")
    .setDescription("Preview tampilan posting lomba IT (admin)")
    .addStringOption(option =>
        option
            .setName("mode")
            .setDescription("Sumber preview")
            .setRequired(false)
            .addChoices(
                { name: "Dummy (contoh buatan)", value: "dummy" },
                { name: "Lomba asli pertama yang relevan", value: "real" }
            )
    )
    .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
    );


async function execute(interaction) {

    const mode = interaction.options.getString("mode") || "dummy";

    await interaction.deferReply();

    try {

        let competition;

        if (mode === "real") {

            const competitions = await getCompetitions();

            for (const candidate of competitions) {

                if (isAlreadyPosted(candidate)) {
                    continue;
                }

                if (!isRelevantCompetition(candidate)) {
                    continue;
                }

                const enriched =
                    await enrichCompetition(candidate);

                if (enriched) {
                    competition = enriched;
                    break;
                }
            }

            if (!competition) {

                await interaction.editReply(
                    "😔 Tidak ada lomba asli yang relevan saat ini. Coba mode dummy."
                );

                return;
            }

        } else {

            competition = {
                title: "Hackathon Nasional Mahasiswa 2026",
                link: "https://infolomba.id/info-hackathon-nasional-2026-1234",
                snippet:
                    "Kompetisi hackathon tahunan untuk mahasiswa se-Indonesia. " +
                    "Kumpulkan tim berisi 3 orang dan buat solusi digital terbaik!",

                organizer: "HMIF Universitas Contoh",
                target: "Mahasiswa",
                fee: "Gratis",
                location: "Online",
                period: "",

                labels: ["hackathon"],
                content: "",

                deadline: "2026-11-20T23:59:00.000Z",

                category: "Hackathon",

                registrationLink:
                    "https://registration.example.com/hackathon",

                source: "InfoLomba",

                aiEnriched: true
            };
        }

        const embed = createCompetitionEmbed(competition);

        // Untuk preview: tombol 🔔 butuh archiveId asli — di preview
        // cukup tombol link saja (sesuai pola testjob).

        const components = competition.link ||
            competition.registrationLink
            ? [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel("Daftar Sekarang")
                        .setEmoji("🔗")
                        .setStyle(ButtonStyle.Link)
                        .setURL(
                            competition.registrationLink ||
                            competition.link
                        )
                )
            ]
            : [];

        const header =
            `🧪 **Preview posting lomba** (${mode})\n` +
            `🗂️ Kategori terdeteksi: **${competition.category}**\n` +
            `🎓 Skor mahasiswa: **${getMahasiswaScore(competition)}**\n` +
            `🤖 AI enriched: **${competition.aiEnriched ? "ya" : "tidak (fallback rule-based)"}**\n`;

        await interaction.editReply({
            content: header,
            embeds: [embed],
            components
        });

    } catch (error) {

        console.error("Gagal menjalankan /testlomba:", error.message);

        await interaction.editReply(
            "❌ Gagal membuat preview: " + error.message
        );
    }
}


module.exports = {
    data,
    execute
};
