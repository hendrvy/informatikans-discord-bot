const { SlashCommandBuilder } = require("discord.js");


// Jawaban gaya magic 8-ball, dikelompokkan biar tidak terasa acak sembarangan.

const POSITIVE_ANSWERS = [
    "Pasti bisa! 💪",
    "Tanpa ragu. ✅",
    "Ya, jelas banget.",
    "Menurutku: iya. 👍",
    "Sinyalnya hijau, gaskeun! 🟢",
    "Semua tanda menunjukkan iya."
];

const NEUTRAL_ANSWERS = [
    "Hmm, coba tanya lagi nanti. 🤔",
    "Rahasia alam, aku tidak bisa jawab. 🌚",
    "Lebih baik kamu pikirkan lagi deh.",
    "Tergantung niat kamu sih... 😏",
    "Bisa iya, bisa tidak. Klasik.",
    "Konsultasikan ke dosen pembimbing dulu. 🎓"
];

const NEGATIVE_ANSWERS = [
    "Menurutku: tidak. ❌",
    "Sepertinya bukan sekarang. ⏳",
    "Jangan harap banyak. 😬",
    "Sumberku bilang jangan. 🙅",
    "Outlook-nya kurang bagus. 📉",
    "Sudahlah, mending rebahan. 🛌"
];

const ALL_ANSWERS = [
    ...POSITIVE_ANSWERS,
    ...NEUTRAL_ANSWERS,
    ...NEGATIVE_ANSWERS
];


const data = new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Tanya apa saja ke magic 8-ball")
    .addStringOption(option =>
        option
            .setName("pertanyaan")
            .setDescription("Pertanyaan yang mau ditanyakan")
            .setRequired(true)
            .setMaxLength(200)
    );


async function execute(interaction) {

    const question = interaction.options.getString("pertanyaan", true);

    const answer = ALL_ANSWERS[
        Math.floor(Math.random() * ALL_ANSWERS.length)
    ];

    await interaction.reply(
        `🔮 **Pertanyaan:** ${question}\n🎱 **Jawaban:** ${answer}`
    );
}


module.exports = {
    data,
    execute,
    ALL_ANSWERS,
    POSITIVE_ANSWERS,
    NEUTRAL_ANSWERS,
    NEGATIVE_ANSWERS
};
