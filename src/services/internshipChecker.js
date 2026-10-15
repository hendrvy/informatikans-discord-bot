const config = require("../config");

const { getJobs, isTotalFailure, failureCounts } = require("./jobCollector");
const { postJob } = require("./jobPoster");
const { isRelevantInternship } = require("./jobFilter");
const { getJobDetails } = require("./jobDetailCollector");
const { isAlreadyPosted } = require("./duplicateChecker");


let isCheckingInternships = false;


// ==============================
// ALERT SCRAPER RUSAK
// ==============================

// Pesan alert hanya dikirim sekali per episode kegagalan
// (tidak berulang tiap siklus selama kondisi sama).

let hasSentFailureAlert = false;

async function maybeSendScraperAlert(channel, client = null) {

    const brokenSources = Object.entries(failureCounts)
        .filter(([, count]) => count > 0)
        .map(([name, count]) => `- ${name}: gagal ${count}x berturut-turut`);

    const totalFailure = isTotalFailure(failureCounts);

    // Kirim alert saat minimal satu sumber mencapai ambang,
    // atau saat total kegagalan (semua rusak sekaligus).

    const shouldAlert =
        (brokenSources.length > 0 && totalFailure) ||
        Object.values(failureCounts)
            .some(count => count >= 3);

    if (!shouldAlert) {

        // Kondisi membaik: reset agar alert berikutnya bisa terkirim

        if (hasSentFailureAlert) {
            console.log("✅ Scraper pulih, alert direset.");
        }

        hasSentFailureAlert = false;
        return;
    }

    if (hasSentFailureAlert) {
        return;
    }

    hasSentFailureAlert = true;

    const message =
        "🚨 **ALERT: Scraper lowongan bermasalah!**\n" +
        "Beberapa sumber gagal diambil berulang kali:\n" +
        brokenSources.join("\n") +
        "\n\nSilakan cek console bot. Kemungkinan website sumber berubah struktur atau koneksi bermasalah.";

    try {

        await channel.send(message);

        console.error("🚨 Alert scraper dikirim ke channel.");

    } catch (error) {

        console.error(
            "Gagal mengirim alert scraper ke channel:",
            error.message
        );

        await sendAdminAlert(client, message);
    }
}


// ==============================
// DM ALERT KE ADMIN (FALLBACK)
// ==============================
// Fallback terakhir kalau channel alert gagal dikirim: DM langsung ke
// admin (ADMIN_USER_ID). Supaya kegagalan scraper tidak luput perhatian
// walaupun bot tidak bisa akses channel-nya.

async function sendAdminAlert(client, message) {

    if (!config.adminUserId || !client) {
        return;
    }

    try {

        const user = await client.users.fetch(config.adminUserId);

        await user.send(
            "⚠️ (Bot tidak bisa mengirim alert ke channel)\n" + message
        );

        console.error("🚨 Alert scraper dikirim via DM ke admin.");

    } catch (error) {

        console.error(
            "Gagal mengirim DM alert ke admin:",
            error.message
        );
    }
}


// ==============================
// CEK LOWONGAN MAGANG & POST YANG RELEVAN
// ==============================

async function checkInternships(client) {

    if (isCheckingInternships) {

        console.log(
            "⏳ Pengecekan sebelumnya masih berjalan, melewati jadwal ini."
        );

        return;
    }

    isCheckingInternships = true;

    try {

        console.log("\n==============================");
        console.log("Mulai mengecek lowongan...");
        console.log("==============================");

        const channel = await client.channels.fetch(config.channelId);

        if (!channel) {
            throw new Error("Channel Discord tidak ditemukan");
        }

        const jobs = await getJobs();

        console.log(`Total lowongan ditemukan: ${jobs.length}`);

        await maybeSendScraperAlert(channel, client);

        for (const job of jobs) {

            try {

                console.log("\n------------------------------");
                console.log(`📡 Sumber: ${job.source}`);
                console.log(`Memproses: ${job.title}`);
                console.log(`Link: ${job.link}`);

                let detailedJob = job;

                // Lowongan yang sudah pernah diposting tidak perlu
                // di-scrape detailnya lagi (hemat puluhan request).

                if (isAlreadyPosted(job)) {

                    console.log(
                        `⏭️ Sudah pernah dikirim, dilewati: ${job.title}`
                    );

                    continue;
                }

                if (job.detailAvailable) {

                    detailedJob = await getJobDetails(job);

                    if (!detailedJob) {

                        console.log(
                            `⚠️ Detail gagal diambil, dilewati: ${job.title}`
                        );

                        continue;
                    }
                }

                if (detailedJob.isExpired) {

                    console.log(
                        `⏰ Lowongan expired, dilewati: ${job.title}`
                    );

                    continue;
                }

                if (!isRelevantInternship(detailedJob)) {

                    console.log(
                        `⏭️ Tidak relevan, dilewati: ${job.title}`
                    );

                    continue;
                }

                console.log("🚀 Lowongan relevan ditemukan!");

                await postJob(channel, detailedJob);

                console.log(`Selesai memproses: ${job.title}`);

            } catch (error) {

                console.error(
                    `Gagal memproses ${job.title}:`,
                    error.message
                );

            }

        }

        console.log("\nPengecekan lowongan selesai!");

    } catch (error) {

        console.error("Gagal mengecek lowongan:", error.message);

    } finally {

        isCheckingInternships = false;

    }

}


module.exports = {
    checkInternships
};
