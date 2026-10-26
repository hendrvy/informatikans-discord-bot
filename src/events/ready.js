const { Events, REST, Routes, ActivityType } = require("discord.js");
const cron = require("node-cron");

const config = require("../config");
const { checkInternships } = require("../services/internshipChecker");
const { checkCompetitions } = require("../services/competitionChecker");
const { startJobReminderScheduler } = require("../services/jobReminder");
const { startCompetitionReminderScheduler } =
    require("../services/competitionReminder");


const name = Events.ClientReady;
const once = true;


// ==============================
// REGISTER SLASH COMMANDS KE GUILD
// ==============================

async function registerCommands(client) {

    const rest = new REST({ version: "10" }).setToken(config.token);

    const body = [...client.slashCommands.values()].map(command =>
        command.data.toJSON()
    );

    try {

        console.log("Mendaftarkan slash command...");

        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body }
        );

        console.log(
            `✅ ${body.length} slash command berhasil didaftarkan.`
        );

    } catch (error) {

        console.error(
            "❌ Gagal mendaftarkan command:",
            error.message
        );

    }
}


async function execute(readyClient) {

    console.log(`Bot berhasil login sebagai ${readyClient.user.tag}`);

    readyClient.user.setPresence({
        activities: [{
            name: `Informatikans | /help`,
            type: ActivityType.Playing
        }]
    });

    await registerCommands(readyClient);

    await checkInternships(readyClient);

    cron.schedule(
        "0 */6 * * *",
        async () => {

            console.log("\n⏰ Scheduler berjalan...");

            await checkInternships(readyClient);

        },
        {
            timezone: "Asia/Jakarta"
        }
    );

    console.log(
        "Scheduler aktif. Bot akan mengecek lowongan setiap 6 jam."
    );

    // ==============================
    // SCHEDULER LOMBA IT
    // ==============================
    // Offset +30 menit dari scheduler lowongan supaya kedua siklus
    // tidak berjalan bersamaan (hemat resource & tidak bersaing
    // mengirim pesan ke channel yang sama).

    if (config.lombaEnabled) {

        await checkCompetitions(readyClient);

        cron.schedule(
            "30 */6 * * *",
            async () => {

                console.log("\n⏰ Scheduler lomba berjalan...");

                await checkCompetitions(readyClient);

            },
            {
                timezone: "Asia/Jakarta"
            }
        );

        console.log(
            "Scheduler lomba aktif. Bot akan mengecek lomba IT " +
            "setiap 6 jam (offset +30 menit)."
        );

        startCompetitionReminderScheduler(readyClient);

    } else {

        console.log(
            "Fitur lomba dimatikan (LOMBA_ENABLED=false)."
        );
    }

    startJobReminderScheduler(readyClient);
}


module.exports = {
    name,
    once,
    execute
};
