const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const { addTriviaPoint, getUserTriviaScore } = require("../services/store");


const QUESTION_TIME_MS = 20 * 1000;

const TRIVIA_API_URL = "https://opentdb.com/api.php?amount=1&type=multiple";

// Huruf label opsi (a/b/c/d).
const OPTION_LABELS = ["🇦", "🇧", "🇨", "🇩"];


const data = new SlashCommandBuilder()
    .setName("trivia")
    .setDescription("Main kuis trivia (jawab cepat, kumpulkan poin!)")
    .addStringOption(option =>
        option
            .setName("kategori")
            .setDescription("Kategori soal (opsional, default: acak)")
            .setRequired(false)
            .addChoices(
                { name: "Umum", value: "9" },
                { name: "Film", value: "11" },
                { name: "Musik", value: "12" },
                { name: "Komputer & Video Games", value: "15" },
                { name: "Matematika", value: "19" },
                { name: "Komputer Sains", value: "18" },
                { name: "Sejarah", value: "23" },
                { name: "Olahraga", value: "21" }
            )
    );


// ==============================
// HTML DECODE (soal dari API kadang mengandung entitas HTML)
// ==============================

function decodeHtml(text) {

    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#039;/g, "'")
        .replace(/&eacute;/g, "é");
}


// ==============================
// AMBIL SOAL DARI OPENTDB
// ==============================

async function fetchQuestion(categoryId) {

    const url = categoryId
        ? `${TRIVIA_API_URL}&category=${categoryId}`
        : TRIVIA_API_URL;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`API trivia merespons ${response.status}`);
    }

    const payload = await response.json();

    if (payload.response_code !== 0 || !Array.isArray(payload.results) ||
        payload.results.length === 0) {

        throw new Error("Tidak ada soal yang tersedia");
    }

    const raw = payload.results[0];

    const answers = raw.incorrect_answers.map(decodeHtml);

    // Posisi jawaban benar diacak.
    const correctIndex = Math.floor(
        Math.random() * (answers.length + 1)
    );

    answers.splice(correctIndex, 0, decodeHtml(raw.correct_answer));

    return {
        question: decodeHtml(raw.question),
        category: raw.category,
        difficulty: raw.difficulty,
        answers,
        correctIndex
    };
}


// ==============================
// HANDLE JAWABAN VIA DM (PRIVATE MESSAGE)
// ==============================
// Untuk keadilan, jawaban dikirim lewat DM supaya pemain lain tidak
// melihat pilihan yang dipilih.

// State soal aktif per channel (satu soal per channel pada satu waktu).
// Key: channelId, value: { correctIndex, players: Map<userId, choiceIndex>, timeout }

const activeQuestions = new Map();


// Dipanggil dari interactionCreate saat tombol trivia:* diklik.

function handleTriviaButton(interaction) {

    const channelId = interaction.message.channelId;

    const questionState = activeQuestions.get(channelId);

    if (!questionState) {
        return false;
    }

    const choiceIndex = Number(interaction.customId.split(":")[1]);

    if (questionState.players.has(interaction.user.id)) {

        interaction.reply({
            content: "Kamu sudah menjawab soal ini! 🙊",
            ephemeral: true
        }).catch(() => {});

        return true;
    }

    questionState.players.set(interaction.user.id, choiceIndex);

    interaction.reply({
        content: "Jawaban tercatat! Hasil diumumkan di channel setelah waktu habis. 🤫",
        flags: MessageFlags.Ephemeral
    }).catch(() => {});

    return true;
}


function buildAnswerButtons(questionState) {

    const row = new ActionRowBuilder();

    questionState.answers.forEach((answer, index) => {

        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`trivia:${index}`)
                .setLabel(answer.substring(0, 80))
                .setEmoji(OPTION_LABELS[index])
                .setStyle(ButtonStyle.Secondary)
        );
    });

    return row;
}


async function execute(interaction) {

    const categoryId = interaction.options.getString("kategori");

    const channelId = interaction.channelId;

    if (activeQuestions.has(channelId)) {

        await interaction.reply({
            content: "⏳ Masih ada soal trivia yang belum selesai di channel ini. Jawab dulu yang itu!",
            ephemeral: true
        });

        return;
    }

    await interaction.deferReply();

    let question;

    try {

        question = await fetchQuestion(categoryId);

    } catch (error) {

        console.error("Gagal mengambil soal trivia:", error.message);

        await interaction.editReply(
            "❌ Gagal mengambil soal trivia. Coba lagi nanti ya!"
        );

        return;
    }

    const questionState = {
        answers: question.answers,
        correctIndex: question.correctIndex,
        players: new Map(),
        timeout: null
    };

    activeQuestions.set(channelId, questionState);

    const embed = new EmbedBuilder()

        .setTitle("🧠 Trivia Time!")

        .setDescription(
            `**${question.question}**\n\n` +
            question.answers
                .map((answer, index) => `${OPTION_LABELS[index]} ${answer}`)
                .join("\n")
        )

        .addFields(
            { name: "Kategori", value: question.category, inline: true },
            { name: "Tingkat", value: question.difficulty, inline: true }
        )

        .setColor(0xfee75c)

        .setFooter({
            text: "Klik salah satu tombol di bawah untuk menjawab! 20 detik ⏱️"
        });

    const message = await interaction.editReply({
        embeds: [embed],
        components: [buildAnswerButtons(questionState)]
    });

    // Setelah waktu habis: umumkan hasil, beri poin ke yang benar.

    questionState.timeout = setTimeout(async () => {

        activeQuestions.delete(channelId);

        const correctAnswer = question.answers[question.correctIndex];

        const winners = [...questionState.players.entries()]
            .filter(([, choiceIndex]) => choiceIndex === question.correctIndex)
            .map(([userId]) => `<@${userId}>`);

        const lines = [];

        if (winners.length > 0) {

            for (const [userId, choiceIndex] of questionState.players.entries()) {

                if (choiceIndex === question.correctIndex) {

                    try {

                        addTriviaPoint(interaction.guildId, userId);

                    } catch (error) {

                        console.error(
                            "Gagal menyimpan poin trivia:",
                            error.message
                        );
                    }
                }
            }

            lines.push(`✅ **Jawaban benar: ${correctAnswer}**`);
            lines.push(`🎉 Benar (${winners.length}): ${winners.join(", ")}`);

            const scoreboard = [...questionState.players.entries()]
                .map(([userId]) => {
                    const points = getUserTriviaScore(interaction.guildId, userId);
                    return `- <@${userId}>: ${points} poin`;
                });

            lines.push("\n📊 **Total poin partisipan:**");
            lines.push(...scoreboard);

        } else if (questionState.players.size === 0) {

            lines.push(`⌛ Tidak ada yang menjawab. Jawabannya: **${correctAnswer}**`);

        } else {

            lines.push(`😢 Semua jawaban salah. Jawaban benar: **${correctAnswer}**`);
        }

        await message.edit({
            content: lines.join("\n"),
            embeds: [],
            components: []
        }).catch(() => {});

    }, QUESTION_TIME_MS);
}


module.exports = {
    data,
    execute,
    handleTriviaButton,
    fetchQuestion,
    decodeHtml,
    OPTION_LABELS,
    QUESTION_TIME_MS
};
