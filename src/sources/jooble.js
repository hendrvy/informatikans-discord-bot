const axios = require("axios");
const { withRetry } = require("../utils/retry");

// Beberapa query berbeda agar cakupan lebih luas.
// Hasil yang sama dari beberapa query otomatis didedup
// berdasarkan ID lowongan.

const QUERIES = [
    "internship IT software developer",
    "internship programmer web",
    "magang IT komputer"
];

const RESULT_ON_PAGE = 20;

// Jooble mendukung pagination. 2 halaman per query memberi
// cakupan lebih luas tanpa memberati kuota API berlebihan.

const MAX_PAGES = 2;

async function queryJooble(keywords) {

    const responses = await Promise.all(
        Array.from(
            { length: MAX_PAGES },
            (_, index) =>
                withRetry(
                    () => axios.post(
                        `https://id.jooble.org/api/${process.env.JOOBLE_API_KEY}`,
                        {
                            keywords,
                            location: "Indonesia",
                            page: index + 1,
                            ResultOnPage: RESULT_ON_PAGE
                        },
                        {
                            timeout: 15000,
                            headers: {
                                "Content-Type": "application/json"
                            }
                        }
                    ),
                    { retries: 3, baseDelayMs: 1000, label: `Jooble API (${keywords}, halaman ${index + 1})` }
                )
        )
    );

    return responses.flatMap(
        response => response.data.jobs || []
    );
}

function mapJoobleJob(job) {
    return {
        id: `jooble-${job.id}`,

        title:
            job.title ||
            "Tidak diketahui",

        position:
            job.title ||
            "Tidak diketahui",

        company:
            job.company ||
            "Tidak disebutkan",

        location:
            job.location ||
            "Tidak disebutkan",

        snippet:
            job.snippet || "",

        requirements:
            job.snippet || "",

        link:
            job.link || "",

        originalSource:
            job.source || "Tidak diketahui",

        source: "Jooble",

        updated:
            job.updated || null,

        deadline:
            "Tidak disebutkan",

        isExpired: false,

        detailAvailable: false
    };
}

async function getJoobleJobs() {
    try {

        console.log("Mengambil lowongan dari Jooble...");

        const results = await Promise.allSettled(
            QUERIES.map(queryJooble)
        );

        const jobsById = new Map();

        for (const result of results) {

            if (result.status !== "fulfilled") {

                console.error(
                    "Gagal menjalankan salah satu query Jooble:",
                    result.reason?.message
                );

                continue;
            }

            for (const job of result.value) {

                if (job.id && !jobsById.has(job.id)) {
                    jobsById.set(job.id, mapJoobleJob(job));
                }
            }
        }

        const jobs = [...jobsById.values()];

        console.log(`Jooble menemukan ${jobs.length} lowongan`);

        return jobs;

    } catch (error) {

        console.error(
            "Gagal mengambil data dari Jooble:",
            error.response?.data || error.message
        );

        return [];
    }
}

module.exports = {
    getJoobleJobs
};