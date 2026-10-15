const { SlashCommandBuilder, PollLayoutType } = require("discord.js");


// Native Discord poll: maksimal 10 jawaban, durasi dalam JAM
// (1–32 jam menurut API Discord; 32 hari dicapai via 768 jam pada
// beberapa endpoint, tapi kita batasi ke rentang yang pasti valid).

const MAX_ANSWERS = 10;
const MIN_DURATION_HOURS = 1;
const MAX_DURATION_HOURS = 32;


const data = new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Buat polling di channel ini")
    .addStringOption(option =>
        option
            .setName("pertanyaan")
            .setDescription("Pertanyaan polling")
            .setRequired(true)
            .setMaxLength(300)
    )
    .addStringOption(option =>
        option
            .setName("opsi")
            .setDescription("Opsi jawaban, pisahkan dengan koma (2-10 opsi). Kosongkan untuk ya/tidak.")
            .setRequired(false)
            .setMaxLength(500)
    )
    .addIntegerOption(option =>
        option
            .setName("durasi_jam")
            .setDescription("Durasi polling dalam jam (1-32, default: 24)")
            .setRequired(false)
            .setMinValue(MIN_DURATION_HOURS)
            .setMaxValue(MAX_DURATION_HOURS)
    )
    .addBooleanOption(option =>
        option
            .setName("multi_jawaban")
            .setDescription("Bolehkan peserta memilih lebih dari satu opsi? (default: tidak)")
            .setRequired(false)
    );


function parseAnswers(optionsText) {

    // Tanpa opsi -> polling ya/tidak.

    if (!optionsText || !optionsText.trim()) {
        return ["Ya", "Tidak"];
    }

    const answers = optionsText
        .split(",")
        .map(answer => answer.trim())
        .filter(Boolean)
        .slice(0, MAX_ANSWERS);

    return answers;
}


async function execute(interaction) {

    const question = interaction.options.getString("pertanyaan", true);
    const optionsText = interaction.options.getString("opsi");
    const durationHours =
        interaction.options.getInteger("durasi_jam") ?? 24;
    const allowMultiselect =
        interaction.options.getBoolean("multi_jawaban") ?? false;

    const answers = parseAnswers(optionsText);

    if (answers.length < 2) {

        await interaction.reply({
            content: "❌ Polling butuh minimal 2 opsi. Pisahkan dengan koma, contoh: `Kopi, Teh, Susu`.",
            ephemeral: true
        });

        return;
    }

    // Native poll Discord — hasilnya dihitung otomatis oleh Discord
    // dan bisa dilihat langsung di pesan, tidak perlu tracking manual.

    await interaction.reply({
        poll: {
            question: {
                text: question
            },
            answers: answers.map(text => ({ text })),
            duration: durationHours,
            allowMultiselect,
            layoutType: PollLayoutType.Default
        }
    });
}


module.exports = {
    data,
    execute,
    parseAnswers,
    MAX_ANSWERS,
    MIN_DURATION_HOURS,
    MAX_DURATION_HOURS
};
