const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const {
    getTopTriviaScores,
    getUserTriviaScore
} = require("../services/store");


const data = new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Lihat peringkat poin trivia di server ini")
    .addUserOption(option =>
        option
            .setName("user")
            .setDescription("Lihat poin user tertentu (default: kamu sendiri)")
            .setRequired(false)
    );


// Medali untuk 3 besar.
const RANK_MEDALS = ["🥇", "🥈", "🥉"];


async function execute(interaction) {

    const targetUser = interaction.options.getUser("user");

    await interaction.deferReply();

    try {

        // ===== Mode poin personal =====

        if (targetUser) {

            const points = getUserTriviaScore(
                interaction.guildId,
                targetUser.id
            );

            await interaction.editReply(
                `🧠 **${targetUser.username}** punya **${points} poin** trivia. ${points > 0 ? "Keren! 👏" : "Main lagi yuk, pakai /trivia! 🎮"}`
            );

            return;
        }

        // ===== Mode papan peringkat =====

        const top = getTopTriviaScores(interaction.guildId, 10);

        if (top.length === 0) {

            await interaction.editReply(
                "📭 Belum ada yang punya poin trivia. Jadilah yang pertama dengan `/trivia`!"
            );

            return;
        }

        const lines = top.map((row, index) => {

            const medal = RANK_MEDALS[index] ?? `**${index + 1}.**`;

            return `${medal} <@${row.user_id}> — **${row.points} poin**`;
        });

        const embed = new EmbedBuilder()

            .setTitle("🏆 Leaderboard Trivia")

            .setDescription(lines.join("\n"))

            .setColor(0xffd700)

            .setFooter({
                text: "Main /trivia untuk menambah poin!"
            })

            .setTimestamp();

        await interaction.editReply({
            embeds: [embed]
        });

    } catch (error) {

        console.error("Gagal menjalankan /leaderboard:", error.message);

        await interaction.editReply(
            "❌ Gagal mengambil leaderboard. Coba lagi nanti ya!"
        );
    }
}


module.exports = {
    data,
    execute,
    RANK_MEDALS
};
