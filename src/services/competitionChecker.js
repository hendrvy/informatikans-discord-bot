// ==============================
// ORKESTRATOR LOMBA IT
// ==============================
//
// Replika internshipChecker.js. Alur per siklus (tiap 6 jam):
// 1. competitionCollector  → gabung lomba dari semua sumber.
// 2. competitionDuplicateChecker → buang yang sudah pernah diposting.
// 3. competitionFilter (rule-based) → buang non-tech / non-Indonesia.
// 4. aiEnricher (Gemini, fallback rule-based) → deadline, kategori,
//    biaya, target, link pendaftaran; AI bisa menolak lomba tak relevan.
// 5. Urutkan berdasar skor prioritas mahasiswa (getMahasiswaScore).
// 6. competitionPoster → embed + tombol 🔔 (maks 10 per siklus).
//
// Lomba yang deadline-nya sudah lewat dilewati (kecuali seed resmi
// yang halamannya tidak menyebut deadline — tetap diposting agar
// info kompetisi besar tidak terlewat).

const config = require("../config");

const {
    getCompetitions,
    isTotalFailure,
    failureCounts
} = require("./competitionCollector");

const { postCompetition } = require("./competitionPoster");
const { isRelevantCompetition, getMahasiswaScore } =
    require("./competitionFilter");
const {
    enrichCompetition,
    resetAiBudget
} = require("./aiEnricher");
const { isAlreadyPosted } =
    require("./competitionDuplicateChecker");


// Maksimum lomba yang diposting per siklus — jangan banjiri channel.

const MAX_POSTS_PER_CYCLE = 10;

// Postingan sumber yang lebih tua dari ini dan tanpa deadline dianggap basi.
const STALE_POST_DAYS = 30;

function isStalePost(publishedDate) {

    const published = new Date(publishedDate || "").getTime();

    if (isNaN(published)) {
        return false;
    }

    return Date.now() - published > STALE_POST_DAYS * 24 * 60 * 60 * 1000;
}

// Lomba AI-enriched mendapat prioritas ekstra di urutan posting.

const AI_BONUS_SCORE = 1;


let isCheckingCompetitions = false;


// ==============================
// ALERT SCRAPER RUSAK
// ==============================

let hasSentFailureAlert = false;

async function maybeSendScraperAlert(channel, client = null) {

    const brokenSources = Object.entries(failureCounts)
        .filter(([, count]) => count > 0)
        .map(([name, count]) =>
            `- ${name}: gagal ${count}x berturut-turut`);

    const totalFailure = isTotalFailure(failureCounts);

    const shouldAlert =
        (brokenSources.length > 0 && totalFailure) ||
        Object.values(failureCounts)
            .some(count => count >= 3);

    if (!shouldAlert) {

        if (hasSentFailureAlert) {
            console.log("✅ Scraper lomba pulih, alert direset.");
        }

        hasSentFailureAlert = false;

        return;
    }

    if (hasSentFailureAlert) {
        return;
    }

    hasSentFailureAlert = true;

    const message =
        "🚨 **ALERT: Scraper lomba IT bermasalah!**\n" +
        "Beberapa sumber gagal diambil berulang kali:\n" +
        brokenSources.join("\n") +
        "\n\nSilakan cek console bot. Kemungkinan website sumber berubah struktur atau koneksi bermasalah.";

    try {

        await channel.send(message);

        console.error("🚨 Alert scraper lomba dikirim ke channel.");

    } catch (error) {

        console.error(
            "Gagal mengirim alert scraper lomba ke channel:",
            error.message
        );

        await sendAdminAlert(client, message);
    }
}


// ==============================
// DM ALERT KE ADMIN (FALLBACK)
// ==============================

async function sendAdminAlert(client, message) {

    if (!config.adminUserId || !client) {
        return;
    }

    try {

        const user = await client.users.fetch(config.adminUserId);

        await user.send(
            "⚠️ (Bot tidak bisa mengirim alert ke channel)\n" + message
        );

        console.error("🚨 Alert scraper lomba dikirim via DM ke admin.");

    } catch (error) {

        console.error(
            "Gagal mengirim DM alert lomba ke admin:",
            error.message
        );
    }
}


// ==============================
// CEK LOMBA & POST YANG RELEVAN
// ==============================

async function checkCompetitions(client) {

    if (isCheckingCompetitions) {

        console.log(
            "⏳ Pengecekan lomba sebelumnya masih berjalan, " +
            "melewati jadwal ini."
        );

        return;
    }

    isCheckingCompetitions = true;

    // Reset budget AI tiap siklus (kuota dihitung per siklus).

    resetAiBudget();

    try {

        console.log("\n==============================");
        console.log("Mulai mengecek lomba IT...");
        console.log("==============================");

        const channel = await client.channels.fetch(
            config.lombaChannelId
        );

        if (!channel) {
            throw new Error("Channel lomba Discord tidak ditemukan");
        }

        const competitions = await getCompetitions();

        console.log(`Total lomba ditemukan: ${competitions.length}`);

        await maybeSendScraperAlert(channel, client);

        // Lapis 1: dedup antar-siklus + antar-sumber dalam batch
        // (link yang sama dari dua sumber hanya diproses sekali).

        const seenInBatch = new Set();

        const candidates = [];

        for (const competition of competitions) {

            if (isAlreadyPosted(competition)) {

                console.log(
                    `⏭️ Sudah pernah dikirim, dilewati: ${competition.title}`
                );

                continue;
            }

            const batchKey = competition.link || competition.title;

            if (seenInBatch.has(batchKey)) {
                continue;
            }

            seenInBatch.add(batchKey);

            candidates.push(competition);
        }

        // Lapis 2: filter relevansi rule-based (hemat kuota AI).

        const relevant = candidates.filter(competition => {

            if (!isRelevantCompetition(competition)) {

                console.log(
                    `⏭️ Tidak relevan (filter), dilewati: ${competition.title}`
                );

                return false;
            }

            return true;
        });

        console.log(
            `Lomba relevan setelah filter: ${relevant.length}`
        );

        // Lapis 3: enrich (AI / fallback) satu per satu.

        const enriched = [];

        for (const competition of relevant) {

            try {

                const result = await enrichCompetition(competition);

                if (!result) {
                    continue;
                }

                // Lomba yang deadline-nya sudah lewat tidak diposting
                // (kecuali deadline tak diketahui — mungkin masih buka).

                if (result.deadline) {

                    const deadlineTime =
                        new Date(result.deadline).getTime();

                    if (!isNaN(deadlineTime) &&
                        deadlineTime < Date.now()) {

                        console.log(
                            `⏰ Deadline sudah lewat, dilewati: ${competition.title}`
                        );

                        continue;
                    }
                }

                // Deadline tak diketahui + postingan sumber sudah lama
                // → hampir pasti lomba basi, jangan diposting.

                if (!result.deadline && isStalePost(result.publishedDate)) {

                    console.log(
                        `🕰️ Postingan lama tanpa deadline, dilewati: ${competition.title}`
                    );

                    continue;
                }

                enriched.push(result);

            } catch (error) {

                console.error(
                    `Gagal enrich ${competition.title}:`,
                    error.message
                );
            }
        }

        // Urutkan: prioritas mahasiswa dulu, AI-enriched bonus kecil.

        enriched.sort((a, b) => {

            const scoreA = getMahasiswaScore(a) +
                (a.aiEnriched ? AI_BONUS_SCORE : 0);

            const scoreB = getMahasiswaScore(b) +
                (b.aiEnriched ? AI_BONUS_SCORE : 0);

            return scoreB - scoreA;
        });

        console.log(
            `Lomba layak posting: ${enriched.length} ` +
            `(maks ${MAX_POSTS_PER_CYCLE} per siklus)`
        );

        let postedCount = 0;

        for (const competition of enriched) {

            if (postedCount >= MAX_POSTS_PER_CYCLE) {

                console.log(
                    `📋 Batas ${MAX_POSTS_PER_CYCLE} posting tercapai, ` +
                    "sisanya menunggu siklus berikutnya."
                );

                break;
            }

            try {

                const posted = await postCompetition(
                    channel,
                    competition
                );

                if (posted) {
                    postedCount++;
                }

            } catch (error) {

                console.error(
                    `Gagal posting lomba ${competition.title}:`,
                    error.message
                );
            }
        }

        const budget = require("./aiEnricher").getAiBudgetInfo();

        console.log(
            `🤖 Penggunaan AI siklus ini: ${budget.used}/${budget.max}` +
            (budget.exhausted ? " (kuota habis)" : "")
        );

        console.log("\nPengecekan lomba selesai!");

    } catch (error) {

        console.error("Gagal mengecek lomba:", error.message);

    } finally {

        isCheckingCompetitions = false;
    }
}


module.exports = {
    checkCompetitions
};
