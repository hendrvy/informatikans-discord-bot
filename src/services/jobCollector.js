const { getJoobleJobs } = require("../sources/jooble");
const { getDevJobsIndoJobs } = require("../sources/devjobsindo");
const { getKalibrrJobs } = require("../sources/kalibrr");

// Jumlah kegagalan berturut-turut per sumber sebelum
// dianggap rusak dan memicu alert.

const FAILURE_THRESHOLD = 3;

// Status kegagalan per sumber: { nama: jumlahGagalBerturut }

const failureCounts = {
    Jooble: 0,
    DevJobsIndo: 0,
    Kalibrr: 0
};

/**
 * Catat hasil scraping satu sumber.
 * Mengembalikan true jika sumber baru saja mencapai
 * ambang batas kegagalan (alert perlu dikirim).
 */
function recordSourceResult(source, jobCount) {

    const previous = failureCounts[source] ?? 0;

    if (jobCount > 0) {

        failureCounts[source] = 0;
        return false;
    }

    failureCounts[source] = previous + 1;

    return (
        failureCounts[source] === FAILURE_THRESHOLD
    );
}

/**
 * Apakah SEMUA sumber kosong? (indikasi kuat ada yang rusak
 * secara global: internet, API key, atau semua website berubah)
 */
function isTotalFailure(counts) {

    const entries = Object.entries(counts);

    return (
        entries.length > 0 &&
        entries.every(([, count]) => count >= FAILURE_THRESHOLD)
    );
}

async function getJobs() {

    console.log("\n🔍 Mengambil lowongan dari semua sumber...");

    const sources = [
        ["Jooble", getJoobleJobs],
        ["DevJobsIndo", getDevJobsIndoJobs],
        ["Kalibrr", getKalibrrJobs]
    ];

    const results = await Promise.allSettled(
        sources.map(([, fetcher]) => fetcher())
    );

    const allJobs = [];

    for (const [index, [name]] of sources.entries()) {

        const result = results[index];

        if (result.status === "fulfilled") {

            if (recordSourceResult(name, result.value.length)) {

                console.error(
                    `🚨 ALERT: Sumber ${name} kosong ${FAILURE_THRESHOLD}x berturut-turut!`
                );
            }

            allJobs.push(...result.value);

        } else {

            if (recordSourceResult(name, 0)) {

                console.error(
                    `🚨 ALERT: Sumber ${name} error ${FAILURE_THRESHOLD}x berturut-turut!`
                );
            }

            console.error(
                "❌ Salah satu sumber gagal:",
                result.reason
            );
        }
    }

    console.log(
        `📦 Total dari semua sumber: ${allJobs.length}`
    );

    return allJobs;
}

module.exports = {
    getJobs,
    recordSourceResult,
    isTotalFailure,
    failureCounts
};
