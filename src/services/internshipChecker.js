const config = require("../config");

const { getJobs } = require("./jobCollector");
const { postJob } = require("./jobPoster");
const { isRelevantInternship } = require("./jobFilter");
const { getJobDetails } = require("./jobDetailCollector");
const { isAlreadyPosted } = require("./duplicateChecker");


let isCheckingInternships = false;


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
