const { Events } = require("discord.js");

const config = require("../config");
const { scheduleEventReminders } = require("../services/eventReminder");


const name = Events.GuildScheduledEventCreate;


async function execute(event, client) {

    console.log(`INFO: Event created: ${event.name}`);

    const channel = await event.guild.channels
        .fetch(config.eventAnnounceChannelId)
        .catch(() => null);

    if (!channel) {

        console.warn(
            `⚠️ Channel announce (${config.eventAnnounceChannelId}) tidak ditemukan, reminder dilewati.`
        );

        return;
    }

    // Role target diambil dari metadata yang disimpan saat /create_event dipanggil.
    // Kalau event dibuat manual lewat UI Discord (bukan via /create_event), metadata
    // ini tidak ada -> fallback ke @everyone (lihat services/eventReminder.js).
    const roleId = client.eventReminderRoles?.get(event.id) ?? null;

    const role = roleId
        ? await event.guild.roles.fetch(roleId).catch(() => null)
        : null;

    scheduleEventReminders(channel, event, role);

    await channel.send(
        `📅 Event [${event.name}](${event.url}) berhasil dibuat dan dijadwalkan pada ${event.scheduledStartAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} WIB.`
    ).catch(() => {});
}


module.exports = {
    name,
    execute
};
