const axios = require("axios");
const cheerio = require("cheerio");
const { withRetry } = require("../utils/retry");

const BASE_URL = "https://www.kalibrr.com";

// Kalibrr: dedup judul+perusahaan karena pagination-nya
// mengulang 15 lowongan yang sama di setiap halaman.

const MAX_PAGES = 3;

const JOB_LINK_PATTERN = /\/c\/[^/]+\/jobs\/\d+/;

function cleanText(text) {
    if (!text) {
        return "";
    }

    return text
        .replace(/\s+/g, " ")
        .trim();
}

function extractJobsFromPage(html, seen) {

    const $ = cheerio.load(html);

    const jobs = [];

    $("a[href]")
        .filter((index, element) =>
            JOB_LINK_PATTERN.test(
                $(element).attr("href") || ""
            )
        )
        .each((index, element) => {

            const $anchor = $(element);

            const href = $anchor.attr("href");

            const title = cleanText(
                $anchor.text()
            );

            if (!href || !title) {
                return;
            }

            const fullLink = href.startsWith("http")
                ? href
                : `${BASE_URL}${href}`;

            // Kalibrr mengulang lowongan yang sama di halaman
            // berikutnya, jadi dedup berdasarkan judul + link job.

            const dedupKey = fullLink.replace(/-\d+$/, "");

            if (seen.has(dedupKey)) {
                return;
            }

            // Card lowongan = container beberapa level di atas
            // anchor judul. Nama perusahaan ada di anchor lain
            // yang mengarah ke halaman perusahaan.

            const card = $anchor.parents().eq(2);

            let company = "";

            card.find("a[href*='/jobs?']").each((c, companyAnchor) => {

                if (company) {
                    return;
                }

                const text = cleanText(
                    $(companyAnchor).text()
                );

                if (text && text !== title) {
                    company = text;
                }
            });

            // Lokasi biasanya berada di elemen kecil di dalam card

            let location = "";

            card.find("span, div").each((c, locElement) => {

                if (location) {
                    return;
                }

                const text = cleanText(
                    $(locElement).text()
                );

                if (
                    text &&
                    text !== title &&
                    text !== company &&
                    text.length < 60 &&
                    /jakarta|bandung|surabaya|yogyakarta|remote|indonesia|jawa|bali|medan|semarang|bekasi|tangerang/i
                        .test(text)
                ) {
                    location = text;
                }
            });

            seen.add(dedupKey);

            jobs.push({
                id: `kalibrr-${fullLink}`,

                title,

                position: title,

                company:

                    company ||
                    "Tidak disebutkan",

                location:

                    location ||
                    "Tidak disebutkan",

                duration: "",

                snippet: "",

                summary: "",

                requirements: "",

                link: fullLink,

                source: "Kalibrr",

                originalSource: "Kalibrr",

                deadline: "Tidak diketahui",

                postedDate: "Tidak diketahui",

                updated: null,

                isExpired: false,

                detailAvailable: false
            });
        });

    return jobs;
}

async function scrapePage(page, seen) {

    const url = page === 1
        ? `${BASE_URL}/home/jobs?te=Internship`
        : `${BASE_URL}/home/jobs/${page}?te=Internship`;

    console.log(
        `Mengambil lowongan dari Kalibrr (halaman ${page})...`
    );

    const response = await withRetry(
        () => axios.get(
            url,
            {
                timeout: 15000,
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                        "AppleWebKit/537.36 (KHTML, like Gecko) " +
                        "Chrome/120.0.0.0 Safari/537.36",
                    "Accept":
                        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language":
                        "id-ID,id;q=0.9,en;q=0.8"
                }
            }
        ),
        { retries: 3, baseDelayMs: 1000, label: `Kalibrr scrape halaman ${page}` }
    );

    return extractJobsFromPage(
        response.data,
        seen
    );
}

async function getKalibrrJobs() {
    try {

        const allJobs = [];
        const seen = new Set();
        let lastPageFirstLink = null;

        for (let page = 1; page <= MAX_PAGES; page++) {

            let pageJobs;

            try {

                pageJobs = await scrapePage(page, seen);

            } catch (error) {

                console.error(
                    `Kalibrr: berhenti di halaman ${page}:`,
                    error.message
                );

                break;
            }

            allJobs.push(...pageJobs);

            if (pageJobs.length === 0) {
                break;
            }

            // Halaman berikutnya masih menampilkan lowongan yang
            // sama? Berarti sudah halaman terakhir yang efektif.

            const firstOfPage = pageJobs[0]?.link;

            if (firstOfPage && lastPageFirstLink === firstOfPage) {
                break;
            }

            lastPageFirstLink = firstOfPage;

            // Jeda kecil antar halaman agar tidak membebani website

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log(
            `Kalibrr menemukan ${allJobs.length} lowongan (${MAX_PAGES} halaman maks.)`
        );
        return allJobs;

    } catch (error) {

        console.error(
            "Gagal mengambil data dari Kalibrr:",
            error.message
        );

        return [];
    }
}

module.exports = {
    getKalibrrJobs
};
