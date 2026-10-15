const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");


// Batas waktu giliran pemain; kalau lewat, dianggap menyerah.

const TURN_TIMEOUT_MS = 60 * 1000;

const CHOICES = {
    rock: { label: "Batu", emoji: "🪨", beats: "scissors" },
    paper: { label: "Kertas", emoji: "📄", beats: "rock" },
    scissors: { label: "Gunting", emoji: "✂️", beats: "paper" }
};

const BEATS_TEXT = {
    "rock>scissors": "Batu menghancurkan Gunting",
    "paper>rock": "Kertas membungkus Batu",
    "scissors>paper": "Gunting memotong Kertas"
};


const data = new SlashCommandBuilder()
    .setName("rps")
    .setDescription("Main suit (batu-kertas-gunting) melawan teman")
    .addUserOption(option =>
        option
            .setName("lawan")
            .setDescription("Lawan yang mau diajak main")
            .setRequired(true)
    );


// ==============================
// LOGIKA INTI (MURNI, BISA DITES)
// ==============================

function decideResult(choiceA, choiceB) {

    if (choiceA === choiceB) {
        return "draw";
    }

    return CHOICES[choiceA].beats === choiceB
        ? "a"
        : "b";
}


// ==============================
// KOMPONEN BUTTON
// ==============================

function buildChoiceButtons() {

    const row = new ActionRowBuilder();

    for (const [value, choice] of Object.entries(CHOICES)) {

        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`rps:${value}`)
                .setLabel(choice.label)
                .setEmoji(choice.emoji)
                .setStyle(ButtonStyle.Primary)
        );
    }

    return row;
}


// ==============================
// GAME STATE IN-MEMORY
// ==============================
// Key: `${challengerId}:${opponentId}`, value: { choices, timeout }
// Sesuai sifat game yang pendek & spesifik per pasangan pemain.

const activeGames = new Map();


function gameKey(playerA, playerB) {
    return [playerA, playerB].sort().join(":");
}


async function waitForTurn(game, message, interaction, turnOf) {

    return new Promise(resolve => {

        game.turnResolve = resolve;

        game.timeout = setTimeout(() => {

            // Giliran tidak dijawab -> batalkan game.

            activeGames.delete(gameKey(game.playerA, game.playerB));

            message.edit({
                content: "⏰ Waktu habis! Game dibatalkan karena ada yang tidak jadi memilih.",
                components: []
            }).catch(() => {});

            resolve(null);

        }, TURN_TIMEOUT_MS);

        game.onChoice = (userId, choice) => {

            if (userId !== turnOf) {
                return false; // bukan giliranannya, abaikan
            }

            clearTimeout(game.timeout);
            resolve(choice);
            return true;
        };
    });
}


// Cari game RPS aktif yang melibatkan user ini.

function findGameForUser(userId) {

    for (const [key, game] of activeGames.entries()) {

        const [idA, idB] = key.split(":");

        if (idA === userId || idB === userId) {
            return { key, game };
        }
    }

    return null;
}


async function execute(interaction) {

    const opponent = interaction.options.getUser("lawan", true);

    if (opponent.bot) {

        await interaction.reply({
            content: "❌ Aku tidak bisa diajak main suit. Coba ajak manusia lain! 🙂",
            ephemeral: true
        });

        return;
    }

    if (opponent.id === interaction.user.id) {

        await interaction.reply({
            content: "❌ Tidak bisa melawan diri sendiri. Cari lawan yang lain!",
            ephemeral: true
        });

        return;
    }

    const key = gameKey(interaction.user.id, opponent.id);

    if (activeGames.has(key)) {

        await interaction.reply({
            content: "⏳ Masih ada game yang berjalan di antara kalian dua. Selesaikan dulu ya!",
            ephemeral: true
        });

        return;
    }

    const game = {
        playerA: interaction.user.id,
        playerB: opponent.id,
        choices: {},
        onChoice: null,
        timeout: null
    };

    activeGames.set(key, game);

    await interaction.reply({
        content: `🎮 **Suit dimulai!** ${interaction.user} melawan ${opponent}!\n\n${interaction.user}, giliranmu memilih dulu (pilih lewat tombol di bawah). Lawan tidak boleh lihat ya! 👀`,
        components: [buildChoiceButtons()]
    });

    const anchorMessage = await interaction.fetchReply();

    // ===== Giliran pemain A =====

    let choiceA = await waitForTurn(
        game, anchorMessage, interaction, interaction.user.id
    );

    if (!choiceA) {
        return; // timeout / dibatalkan
    }

    await interaction.editReply({
        content: `🎮 **Suit berjalan!** ${interaction.user} sudah memilih.\n\n${opponent}, sekarang giliranmu! Pilih lewat tombol di bawah.`,
        components: [buildChoiceButtons()]
    });

    // ===== Giliran pemain B =====

    let choiceB = await waitForTurn(
        game, anchorMessage, interaction, opponent.id
    );

    activeGames.delete(key);

    if (!choiceB) {
        return; // timeout / dibatalkan
    }

    // ===== Hasil =====

    const result = decideResult(choiceA, choiceB);

    const userA = interaction.user;
    const userB = opponent;

    const choiceTextA = `${CHOICES[choiceA].emoji} ${CHOICES[choiceA].label}`;
    const choiceTextB = `${CHOICES[choiceB].emoji} ${CHOICES[choiceB].label}`;

    let headline;

    if (result === "draw") {

        headline = "🤝 **SERI!** Tidak ada yang menang.";

    } else if (result === "a") {

        headline = `🏆 ${userA} **MENANG!**`;

    } else {

        headline = `🏆 ${userB} **MENANG!**`;
    }

    const reasonKey = result === "a"
        ? `${choiceA}>${choiceB}`
        : `${choiceB}>${choiceA}`;

    const reason = result !== "draw"
        ? `\n_${BEATS_TEXT[reasonKey]}._`
        : "";

    await interaction.editReply({
        content:
            `${headline}\n\n` +
            `${userA}: ${choiceTextA}\n` +
            `${userB}: ${choiceTextB}` +
            reason,
        components: []
    });
}


// Dipanggil dari interactionCreate saat tombol rps:* diklik.

function handleRpsButton(interaction) {

    const found = findGameForUser(interaction.user.id);

    if (!found) {
        return false; // bukan bagian dari game mana pun
    }

    const { game } = found;

    const choice = interaction.customId.split(":")[1];

    const accepted = game.onChoice?.(interaction.user.id, choice);

    if (accepted) {

        interaction.deferUpdate().catch(() => {});
        return true;
    }

    // User terlibat di game tapi bukan gilirannya sekarang.

    interaction.reply({
        content: "Sabar, bukan giliranmu! 😤",
        ephemeral: true
    }).catch(() => {});

    return true;
}


module.exports = {
    data,
    execute,
    handleRpsButton,
    decideResult,
    CHOICES
};
