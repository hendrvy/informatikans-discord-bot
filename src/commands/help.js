const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    MessageFlags
} = require("discord.js");


const COLOR = 0x5865f2;


// ==============================
// KONTEN HELP PER KATEGORI
// ==============================

const CATEGORIES = {
    umum: {
        emoji: "🛠️",
        title: "Umum & Utilitas",
        description: [
            "`/help` — tampilkan menu bantuan ini.",
            "`/ping` — cek latency bot.",
            "`/say` — bot kirim ulang pesanmu di channel ini (admin).",
            "`/sayto` — bot kirim pesanmu ke channel lain (admin)."
        ].join("\n")
    },

    lowongan: {
        emoji: "🔍",
        title: "Lowongan Magang IT",
        description: [
            "Lowongan baru diposting otomatis setiap 6 jam dari **Jooble**, **DevJobsIndo**, dan **Kalibrr**.",
            "`/lowongan [kategori] [kata_kunci] [jumlah]` — lihat arsip lowongan yang sudah diposting.",
            "`/cari [kata_kunci] [kategori] [lokasi] [sumber]` — cari lowongan on-demand.",
            "`/testjob` — preview format embed lowongan (admin).",
            "",
            "🔔 Klik tombol **Ingatkan saya** di embed lowongan untuk dapat DM pengingat H-3 & H-1 sebelum deadline.",
            "",
            "⚠️ Selalu verifikasi info di link resmi sebelum melamar — waspada penipuan!"
        ].join("\n")
    },

    komunitas: {
        emoji: "💡",
        title: "Komunitas",
        description: [
            "`/saran isi:<teks>` — kirim saran untuk komunitas. Saran masuk ke channel saran dengan vote 👍/👎.",
            "Admin (Manage Server) bisa menandai saran ✅ Disetujui atau ❌ Ditolak lewat tombol di embed.",
            "",
            "💡 Set channel tujuan lewat env `SUGGESTION_CHANNEL_ID` (default: channel lowongan)."
        ].join("\n")
    },

    event: {
        emoji: "📅",
        title: "Event & Reminder",
        description: [
            "`/create_event name desc channel start_time end_time [role] [image]` — buat event (format waktu `DD-MM-YYYY HH:MM` WIB).",
            "`/delete_event event_id:<id>` — hapus event.",
            "",
            "Reminder otomatis dikirim di H-7, H-5, H-3, H-1, 12 jam, 6 jam, 3 jam, 1 jam, 30 menit, 15 menit, 5 menit, dan saat event mulai."
        ].join("\n")
    },

    autorole: {
        emoji: "👋",
        title: "Perkenalan & Autorole",
        description: [
            "Kirim perkenalan di channel intro dengan format:",
            "```",
            "Nama: ...",
            "Nama panggilan: ...",
            "Angkatan: 2026",
            "Hobi: ...",
            "Minat: ...",
            "```",
            "Bot akan menyapamu, memberi role **Informatikans**, dan membuat + memberi role angkatan **Akt'26** otomatis."
        ].join("\n")
    }
};


// ==============================
// BUILD EMBED
// ==============================

function buildOverviewEmbed() {

    const lines = Object.values(CATEGORIES)
        .map(category => `${category.emoji} **${category.title}**`)
        .join("\n");

    return new EmbedBuilder()

        .setTitle("🤖 Panduan Bot Informatikans")

        .setDescription(
            "Halo! Aku bot komunitas Informatikans. Pilih kategori di menu bawah untuk melihat daftar command, atau pakai ringkasan ini:\n\n" +
            lines +
            "\n\n💡 Ketik `/` di kotak chat untuk melihat semua command lengkap dengan parameternya."
        )

        .setColor(COLOR)

        .setFooter({ text: "Pilih kategori dari menu di bawah ⬇️" });
}


function buildCategoryEmbed(key) {

    const category = CATEGORIES[key];

    return new EmbedBuilder()

        .setTitle(`${category.emoji} ${category.title}`)

        .setDescription(category.description)

        .setColor(COLOR)

        .setFooter({ text: "Kembali ke menu utama: /help" });
}


function buildCategorySelectRow() {

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId("help_category")
            .setPlaceholder("Pilih kategori fitur...")
            .addOptions(
                Object.entries(CATEGORIES).map(([key, category]) => ({
                    label: category.title,
                    value: key,
                    emoji: category.emoji,
                    description: `Daftar command kategori ${category.title}`
                }))
            )
    );

    return row;
}


// ==============================
// EXECUTE
// ==============================

async function execute(interaction) {

    await interaction.reply({
        embeds: [buildOverviewEmbed()],
        components: [buildCategorySelectRow()]
    });
}


// ==============================
// HANDLE SELECT MENU (dari interactionCreate)
// ==============================

async function handleHelpSelect(interaction) {

    const key = interaction.values[0];

    if (!CATEGORIES[key]) {

        await interaction.reply({
            content: "❌ Kategori tidak dikenal.",
            flags: MessageFlags.Ephemeral
        }).catch(() => {});

        return true;
    }

    await interaction.update({
        embeds: [buildCategoryEmbed(key)],
        components: [buildCategorySelectRow()]
    });

    return true;
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Panduan & daftar semua fitur bot"),
    execute,
    handleHelpSelect,
    CATEGORIES
};
