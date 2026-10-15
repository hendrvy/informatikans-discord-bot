const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    EmbedBuilder
} = require("discord.js");


const data = new SlashCommandBuilder()
    .setName("rolepanel")
    .setDescription("Buat panel ambil role sendiri (self-role)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(option =>
        option
            .setName("judul")
            .setDescription("Judul panel")
            .setRequired(true)
            .setMaxLength(100)
    )
    .addRoleOption(option =>
        option
            .setName("role_1")
            .setDescription("Role yang bisa diambil member (wajib minimal 1)")
            .setRequired(true)
    )
    .addRoleOption(option =>
        option
            .setName("role_2")
            .setDescription("Role yang bisa diambil member")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option
            .setName("role_3")
            .setDescription("Role yang bisa diambil member")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option
            .setName("role_4")
            .setDescription("Role yang bisa diambil member")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option
            .setName("role_5")
            .setDescription("Role yang bisa diambil member")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option
            .setName("role_6")
            .setDescription("Role yang bisa diambil member")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option
            .setName("role_7")
            .setDescription("Role yang bisa diambil member")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option
            .setName("role_8")
            .setDescription("Role yang bisa diambil member")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option
            .setName("role_9")
            .setDescription("Role yang bisa diambil member")
            .setRequired(false)
    )
    .addRoleOption(option =>
        option
            .setName("role_10")
            .setDescription("Role yang bisa diambil member")
            .setRequired(false)
    )
    .addStringOption(option =>
        option
            .setName("deskripsi")
            .setDescription("Deskripsi tambahan pada panel")
            .setRequired(false)
            .setMaxLength(500)
    );


async function execute(interaction) {

    const title = interaction.options.getString("judul", true);
    const description = interaction.options.getString("deskripsi");

    // Kumpulkan role dari opsi role_1 .. role_10, buang duplikat &
    // role yang tidak ada.

    const roles = [];

    for (let i = 1; i <= 10; i++) {

        const role = interaction.options.getRole(`role_${i}`);

        if (role && !roles.some(existing => existing.id === role.id)) {
            roles.push(role);
        }
    }

    if (roles.length === 0) {

        await interaction.reply({
            content: "❌ Minimal satu role harus dipilih.",
            ephemeral: true
        });

        return;
    }

    // Role panel tidak boleh memberikan role yang setara/di atas bot,
    // dan role dengan permission berbahaya sebaiknya tidak di-self-serve.
    // Kita cek posisi role bot terhadap setiap role target.

    const me = interaction.guild.members.me;

    const unassignable = roles.filter(
        role => role.position >= me.roles.highest.position
    );

    if (unassignable.length > 0) {

        await interaction.reply({
            content: `❌ Aku tidak bisa mengelola role berikut (posisinya terlalu tinggi atau setara denganku):\n${unassignable.map(role => `- ${role}`).join("\n")}`,
            ephemeral: true
        });

        return;
    }

    // Select menu role: member memilih dari daftar role panel untuk
    // mengambil role; menghapus pilihan untuk melepas role (toggle).
    // Kita pakai StringSelectMenu dengan value = roleId supaya pilihan
    // member terbatas hanya ke daftar role panel (bukan role apa pun).

    const stringMenu = new StringSelectMenuBuilder()
        .setCustomId("rolepanel_select")
        .setPlaceholder("Pilih role yang mau kamu ambil / lepas")
        .setMinValues(0)
        .setMaxValues(roles.length)
        .addOptions(
            roles.map(role => ({
                label: role.name.substring(0, 100),
                value: role.id,
                description: `Ambil atau lepas role ${role.name}`.substring(0, 100)
            }))
        );

    const embed = new EmbedBuilder()

        .setTitle(`📋 ${title}`)

        .setDescription(
            (description ? `${description}\n\n` : "") +
            "Pilih role dari menu di bawah untuk **mengambil**.\n" +
            "Hapus pilihan role (klik ❌ pada role yang sudah dipilih) untuk **melepas** role tersebut."
        )

        .setColor(0x5865f2)

        .setFooter({
            text: "Kamu bebas ambil & lepas role kapan saja."
        });

    const row = new ActionRowBuilder().addComponents(stringMenu);

    await interaction.channel.send({
        embeds: [embed],
        components: [row]
    });

    await interaction.reply({
        content: "✅ Panel role berhasil dibuat!",
        ephemeral: true
    });
}


module.exports = {
    data,
    execute,
    ROLEPANEL_SELECT_ID: "rolepanel_select"
};
