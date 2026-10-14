const axios = require("axios");
const cheerio = require("cheerio");
const { withRetry } = require("../utils/retry");

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
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim();
}

function shortenText(text, maxLength = 1000) {
    if (!text) {
        return "Tidak disebutkan.";
    }

    if (text.length <= maxLength) {
        return text;
    }

    return text.substring(0, maxLength - 3) + "...";
}

/**
 * Cari text berdasarkan label.
 */
function getTextBetween(text, startLabel, endLabels = []) {
    if (!text) {
        return "";
    }

    const lowerText = text.toLowerCase();
    const lowerStart = startLabel.toLowerCase();

    const startIndex = lowerText.indexOf(lowerStart);

    if (startIndex === -1) {
        return "";
    }

    const contentStart =
        startIndex + startLabel.length;

    let contentEnd = text.length;

    for (const endLabel of endLabels) {
        const index = lowerText.indexOf(
            endLabel.toLowerCase(),
            contentStart
        );

        if (
            index !== -1 &&
            index < contentEnd
        ) {
            contentEnd = index;
        }
    }

    return text
        .substring(contentStart, contentEnd)
        .trim();
}

/**
 * Parse tanggal seperti:
 * August 26, 2026
 */
function parseDate(dateText) {
    if (!dateText) {
        return null;
    }

    const date = new Date(dateText);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}

/**
 * Cek apakah deadline sudah lewat.
 */
function isDeadlineExpired(deadline) {
    const date = parseDate(deadline);

    if (!date) {
        return false;
    }

    const today = new Date();

    today.setHours(23, 59, 59, 999);

    return date < today;
}

/**
 * Ambil tanggal deadline dari halaman.
 */
function extractDeadline(bodyText) {

    // Pola:
    // August 18, 2026 - August 26, 2026

    const rangeMatch = bodyText.match(
        /([A-Z][a-z]+ \d{1,2}, \d{4})\s*-\s*([A-Z][a-z]+ \d{1,2}, \d{4})/
    );

    if (rangeMatch) {
        return rangeMatch[2];
    }

    // Pola:
    // Deadline : 26 August 2026
    const deadlineMatch = bodyText.match(
        /deadline\s*:?\s*(\d{1,2}\s+[A-Z][a-z]+\s+\d{4})/i
    );

    if (deadlineMatch) {
        return deadlineMatch[1];
    }

    // Pola:
    // Deadline : August 26, 2026
    const deadlineMatch2 = bodyText.match(
        /deadline\s*:?\s*([A-Z][a-z]+ \d{1,2}, \d{4})/i
    );

    if (deadlineMatch2) {
        return deadlineMatch2[1];
    }

    return "Tidak diketahui";
}

/**
 * Coba mencari company dari metadata halaman.
 */
function extractCompany($, bodyText, job) {

    // -----------------------------------
    // 1. Gunakan company dari collector
    // -----------------------------------

    if (
        job.company &&
        job.company !== "Tidak disebutkan"
    ) {
        return cleanText(job.company);
    }

    // -----------------------------------
    // 2. Metadata umum
    // -----------------------------------

    const selectors = [
        ".job-company",
        ".company-name",
        ".company",
        ".job_meta .company",
        ".job-meta .company",
        ".company-name a",
        "[class*='company']"
    ];

    for (const selector of selectors) {

        const element = $(selector).first();

        if (!element.length) {
            continue;
        }

        const text = cleanText(
            element.text()
        );

        if (
            text &&
            text.length < 150 &&
            !/reports to/i.test(text)
        ) {
            return text;
        }
    }

    // -----------------------------------
    // 3. Ambil dari Share this job section
    // -----------------------------------

    const shareMatch = bodyText.match(
        /Share this job\s+(.+?)\s+(?:NGO Job Search|Job Category)/i
    );

    if (shareMatch) {

        const text = cleanText(
            shareMatch[1]
        );

        /*
         * Biasanya bagian ini berbentuk:
         *
         * Company Name
         * NGO Job Search
         */

        if (
            text &&
            text.length < 200
        ) {
            return text;
        }
    }

    // -----------------------------------
    // 4. Jangan mengambil "Reports to"
    // -----------------------------------

    return "Tidak disebutkan";
}

/**
 * Ambil location dari halaman.
 */
function extractLocation($, bodyText, job) {

    if (
        job.location &&
        job.location !== "Tidak disebutkan"
    ) {
        return cleanText(job.location);
    }

    const selectors = [
        ".job-location",
        ".location",
        ".job_meta .location",
        ".job-meta .location",
        "[class*='location']"
    ];

    for (const selector of selectors) {

        const element = $(selector).first();

        if (!element.length) {
            continue;
        }

        const text = cleanText(
            element.text()
        );

        if (
            text &&
            text.length < 150
        ) {
            return text;
        }
    }

    // Cari pola umum Location:
    const locationMatch = bodyText.match(
        /Location\s*:?\s*(.{1,150}?)(?=Applications?|Deadline|Employment Type|Job Description|About Us|JOB|How to Apply)/i
    );

    if (locationMatch) {

        const location = cleanText(
            locationMatch[1]
        );

        if (location) {
            return location;
        }
    }

    return "Tidak disebutkan";
}

/**
 * Ambil description.
 */
function extractDescription($, bodyText, job) {

    const selectors = [
        ".job-desc",
        ".job-detail",
        ".job-description",
        ".single-job-content",
        ".entry-content",
        ".noo-single-job-content",
        "article"
    ];

    let bestText = "";

    for (const selector of selectors) {

        $(selector).each((index, element) => {

            const text = cleanHtmlText(
                $(element).text()
            );

            if (
                text.length > bestText.length
            ) {
                bestText = text;
            }

        });
    }

    if (bestText) {
        return bestText;
    }

    if (job.snippet) {
        return cleanHtmlText(
            job.snippet
        );
    }

    return "";
}

/**
 * Ambil requirements.
 */
function extractRequirements(bodyText) {

    const sections = [
        [
            "Qualifications and Skills",
            [
                "Benefits",
                "How to Apply",
                "This job has expired",
                "Related Jobs"
            ]
        ],
        [
            "Qualifications",
            [
                "Benefits",
                "How to Apply",
                "This job has expired",
                "Related Jobs"
            ]
        ],
        [
            "JOB REQUIREMENTS",
            [
                "HOW TO APPLY",
                "APPLICATION",
                "Related Jobs"
            ]
        ],
        [
            "REQUIREMENTS",
            [
                "HOW TO APPLY",
                "APPLICATION",
                "Related Jobs"
            ]
        ]
    ];

    for (const [start, ends] of sections) {

        const result = getTextBetween(
            bodyText,
            start,
            ends
        );

        if (result) {
            return result;
        }
    }

    return "";
}

/**
 * Ambil summary/job description.
 */
function extractSummary(bodyText) {

    const sections = [
        [
            "Job Description",
            [
                "Key Responsibilities",
                "Qualifications and Skills",
                "Qualifications",
                "Benefits",
                "How to Apply",
                "This job has expired",
                "Related Jobs"
            ]
        ],
        [
            "JOB DESCRIPTION",
            [
                "JOB RESPONSIBILITIES",
                "JOB REQUIREMENTS",
                "QUALIFICATIONS",
                "REQUIREMENTS",
                "HOW TO APPLY",
                "Related Jobs"
            ]
        ],
        [
            "JOB SUMMARY",
            [
                "JOB RESPONSIBILITIES",
                "JOB REQUIREMENTS",
                "QUALIFICATIONS",
                "REQUIREMENTS",
                "HOW TO APPLY",
                "Related Jobs"
            ]
        ]
    ];

    for (const [start, ends] of sections) {

        const result = getTextBetween(
            bodyText,
            start,
            ends
        );

        if (result) {
            return result;
        }
    }

    return "";
}

async function getJobDetails(job) {

    try {

        console.log(
            `🔎 Mengambil detail: ${job.title}`
        );

        const response = await withRetry(
            () => axios.get(
                job.link,
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
                            "en-US,en;q=0.9"
                    }
                }
            ),
            { retries: 2, baseDelayMs: 1000, label: `Detail scrape (${job.title})` }
        );

        const $ = cheerio.load(
            response.data
        );

        const bodyText = cleanText(
            $("body").text()
        );

        const lowerBody =
            bodyText.toLowerCase();

        // =====================================
        // EXPIRED DARI WEBSITE
        // =====================================

        let isExpired =
            lowerBody.includes("this job has expired") ||
            lowerBody.includes("job expired") ||
            lowerBody.includes("job has expired") ||
            lowerBody.includes("this job is closed");

        // =====================================
        // POSITION
        // =====================================

        const position =
            job.title ||
            cleanText(
                $("h1").first().text()
            ) ||
            "Tidak diketahui";

        // =====================================
        // COMPANY
        // =====================================

        const company =
            extractCompany(
                $,
                bodyText,
                job
            );

        // =====================================
        // LOCATION
        // =====================================

        const location =
            extractLocation(
                $,
                bodyText,
                job
            );

        // =====================================
        // DEADLINE
        // =====================================

        const deadline =
            extractDeadline(bodyText);

        // Kalau deadline sudah lewat,
        // anggap expired juga.

        if (
            isDeadlineExpired(deadline)
        ) {
            isExpired = true;
        }

        // =====================================
        // DESCRIPTION
        // =====================================

        let summary =
            extractSummary(
                bodyText
            );

        if (!summary) {

            summary =
                extractDescription(
                    $,
                    bodyText,
                    job
                );
        }

        // =====================================
        // REQUIREMENTS
        // =====================================

        const requirements =
            extractRequirements(
                bodyText
            );

        // =====================================
        // DURASI
        // =====================================

        let duration = job.duration || "";

        if (!duration) {

            const durationMatch = bodyText.match(
                /Duration\s*:?\s*(.*?)(?=\s*(?:Organization and department|Organization|Location|Commencement|Expected Joining Date|Candidate Year|Work Arrangement|Direct Supervisor|Applications?|Deadline|Job Description|How to Apply))/i
            );

            if (durationMatch) {

                duration = cleanText(
                    durationMatch[1]
                );
            }
        }

        if (!duration) {
            duration = "Tidak disebutkan";
}

        // =====================================
        // HASIL
        // =====================================

        const detailedJob = {

            ...job,

            position,

            company,

            location,

            duration,

            postedDate:
                job.postedDate ||
                "Tidak diketahui",

            deadline,

            summary:
                shortenText(
                    summary,
                    1200
                ),

            requirements:
                shortenText(
                    requirements,
                    1200
                ),

            isExpired
        };

        // =====================================
        // DEBUG
        // =====================================

        console.log(
            "=== DETAIL BERHASIL DIAMBIL ==="
        );

        console.log(
            "Posisi:",
            detailedJob.position
        );

        console.log(
            "Organisasi:",
            detailedJob.company
        );

        console.log(
            "Lokasi:",
            detailedJob.location
        );

        console.log(
            "Durasi:",
            detailedJob.duration
        );

        console.log(
            "Deadline:",
            detailedJob.deadline
        );

        console.log(
            "Expired:",
            detailedJob.isExpired
        );

        return detailedJob;

    } catch (error) {

        console.error(
            `❌ Gagal mengambil detail ${job.title}:`,
            error.message
        );

        return null;
    }
}

module.exports = {
    getJobDetails
};