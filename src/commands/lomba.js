const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { getRecentCompetitions } = require("../services/store");


const data = new SlashCommandBuilder()
    .setName("lomba")
    .setDescription("Lihat arsip lomba IT yang sudah diposting bot")
    .addStringOption(option =>
        option
            .setName("kata_kunci")
            .setDescription("Cari kata kunci di judul/penyelenggara (mis. 'hackathon')")
            .setRequired(false)
    )
    .addIntegerOption(option =>
        option
            .setName("jumlah")
            .setDescription("Jumlah lomba yang ditampilkan (default 10, maks 25)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(25)
    );


async function execute(interaction) {

    await interaction.deferReply();

    try {

        const keyword =
            interaction.options.getString("kata_kunci");

        const limit =
            interaction.options.getInteger("jumlah") || 10;

        const competitions = getRecentCompetitions({
            limit,
            keyword
        });

        if (competitions.length === 0) {

            await interaction.editReply(
                keyword
                    ? `😔 Tidak ada lomba yang cocok dengan kata kunci **${keyword}** di arsip.`
                    : "😔 Arsip lomba masih kosong. Tunggu bot memposting lomba baru (cek tiap 6 jam)."
            );

            return;
        }

        const description = competitions
            .map((competition, index) => {

                const title =
                    competition.title || "Lomba IT";

                const organizer = competition.organizer
                    ? ` — ${competition.organizer}`
                    : "";

                const deadlineText = competition.deadline
                    ? ` ⏰ ${new Date(competition.deadline).toLocaleDateString(
                        "id-ID",
                        { day: "numeric", month: "short", year: "numeric" }
                    )}`
                    : "";

                const date = competition.posted_at
                    ? new Date(competition.posted_at).toLocaleDateString(
                        "id-ID",
                        { day: "numeric", month: "short" }
                    )
                    : "";

                const meta = [
                    competition.category ?? null,
                    competition.fee ?? null,
                    date ? `📅 ${date}` : null
                ].filter(Boolean).join(" • ");

                const heading = competition.link
                    ? `${index + 1}. [**${title}**](${competition.link})${organizer}`
                    : `${index + 1}. **${title}**${organizer}`;

                return `${heading}${deadlineText}` +
                    (meta ? `\n   ${meta}` : "");
            })
            .join("\n");

        const embed = new EmbedBuilder()

            .setTitle("🏆 Arsip Lomba IT")

            .setDescription(description)

            .setColor(0x57f287)

            .setFooter({
                text: `${competitions.length} lomba • Klik judul untuk membuka info lomba`
            })

            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {

        console.error("Gagal menjalankan /lomba:", error.message);

        await interaction.editReply(
            "❌ Gagal mengambil arsip lomba. Coba lagi nanti ya!"
        );
    }
}


module.exports = {
    data,
    execute
};
