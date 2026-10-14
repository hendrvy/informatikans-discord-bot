const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { createJobEmbed } = require("../services/jobPoster");


const data = new SlashCommandBuilder()
    .setName("testjob")
    .setDescription(
        "Menampilkan preview Embed lowongan magang"
    )
    .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
    );


async function execute(interaction) {

    await interaction.deferReply();

    const dummyJob = {

        title: "Software Engineer Intern",
        position: "Software Engineer Intern",
        company: "PT Contoh Indonesia",
        location: "Jakarta, Indonesia",

        requirements:
            "Mahasiswa aktif minimal semester 5\n" +
            "Menguasai dasar JavaScript\n" +
            "Memahami Git dan GitHub\n" +
            "Bersedia bekerja secara hybrid",

        deadline: "September 30, 2026",
        updated: "August 30, 2026",
        source: "LinkedIn",
        originalSource: "",
        link: "https://www.linkedin.com/jobs/",
        snippet: ""
    };

    const embed = createJobEmbed(dummyJob);

    await interaction.editReply({
        embeds: [embed]
    });
}


module.exports = {
    data,
    execute
};
