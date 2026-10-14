const axios = require("axios");
const cheerio = require("cheerio");
const { withRetry } = require("../utils/retry");

const BASE_URL = "https://devjobsindo.org";

function cleanText(text) {
    if (!text) {
        return "";
    }

    return text
        .replace(/\s+/g, " ")
        .replace(/·/g, "•")
        .trim();
}

function cleanHtmlText(text) {
    if (!text) {
        return "";
    }

    return text
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, " ")
        .trim();
}

const MAX_PAGES = 5;

async function scrapePage(page, seen) {

    const url = page === 1
        ? `${BASE_URL}/job-type/internship/`
        : `${BASE_URL}/job-type/internship/page/${page}/`;

    console.log(
        `Mengambil lowongan dari DevJobsIndo (halaman ${page})...`
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
                        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                }
            }
        ),
        { retries: 3, baseDelayMs: 1000, label: `DevJobsIndo scrape halaman ${page}` }
    );

    const $ = cheerio.load(response.data);

    const jobs = [];

    $("a[href*='/ngo-jobs/']").each((index, element) => {
        const href = $(element).attr("href");

        if (!href) {
            return;
        }

        if (
            href.includes("/ngo-jobs/page/") ||
            href.endsWith("/ngo-jobs/")
        ) {
            return;
        }

        const title = cleanText($(element).text());

        if (!title) {
            return;
        }

        const fullLink = href.startsWith("http")
            ? href
            : `${BASE_URL}${href}`;

        if (seen.has(fullLink)) {
            return;
        }

        seen.add(fullLink);

        jobs.push({
            id: `devjobsindo-${fullLink}`,

            title,

            position: title,

            company: "",

            location: "",

            duration: "",

            snippet: "",

            summary: "",

            requirements: "",

            link: fullLink,

            source: "DevJobsIndo",

            originalSource: "DevJobsIndo",

            deadline: "Tidak diketahui",

            postedDate: "Tidak diketahui",

            updated: null,

            isExpired: false,

            detailAvailable: true
        });
    });

    return jobs;
}

async function getDevJobsIndoJobs() {
    try {
        const allJobs = [];
        const seen = new Set();

        for (let page = 1; page <= MAX_PAGES; page++) {

            let pageJobs;

            try {

                pageJobs = await scrapePage(page, seen);

            } catch (error) {

                // Halaman tidak ada (404) atau gagal berulang kali:
                // berhenti, jangan batalkan halaman-halaman sebelumnya.

                console.error(
                    `DevJobsIndo: berhenti di halaman ${page}:`,
                    error.message
                );

                break;
            }

            allJobs.push(...pageJobs);

            if (pageJobs.length === 0) {
                break;
            }

            // Jeda kecil antar halaman agar tidak membebani website

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log(
            `DevJobsIndo menemukan ${allJobs.length} lowongan (${MAX_PAGES} halaman maks.)`
        );

        return allJobs;

    } catch (error) {
        console.error(
            "Gagal mengambil data dari DevJobsIndo:",
            error.message
        );

        return [];
    }
}

module.exports = {
    getDevJobsIndoJobs
};