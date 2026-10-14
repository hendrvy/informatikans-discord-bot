const { getJoobleJobs } = require("../sources/jooble");
const { getDevJobsIndoJobs } = require("../sources/devjobsindo");
const { getKalibrrJobs } = require("../sources/kalibrr");

async function getJobs() {

    console.log("\n🔍 Mengambil lowongan dari semua sumber...");

    const results = await Promise.allSettled([
        getJoobleJobs(),
        getDevJobsIndoJobs(),
        getKalibrrJobs()
    ]);

    const allJobs = [];

    for (const result of results) {

        if (result.status === "fulfilled") {

            allJobs.push(...result.value);

        } else {

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
    getJobs
};