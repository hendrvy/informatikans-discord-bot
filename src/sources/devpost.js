// ==============================
// SUMBER LOMBA: DEVPOST (HACKATHON GLOBAL ONLINE)
// ==============================
//
// Devpost menyediakan endpoint JSON publik untuk daftar hackathon.
// Sumber ini bersifat GLOBAL: hanya hackathon yang bisa diikuti
// online (atau berlokasi di Indonesia) yang diambil, ditandai
// `global: true` supaya lolos filter "wajib Indonesia".
//
// Deadline sudah dihitung di sini dari `submission_period_dates`
// (mis. "Oct 28 - 30, 2026" atau "Aug 23, 2026 - Jan 02, 2027").

const axios = require("axios");
const { withRetry } = require("../utils/retry");

const API_URL = "https://devpost.com/api/hackathons";

const PAGES = 2;

const PER_PAGE = 24;

// Ambang kualitas hackathon global.
const MIN_REGISTRATIONS = 300;

const MIN_DAYS_LEFT = 3;

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
};

const MONTHS_EN = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

// ==============================
// PARSING PERIODE
// ==============================

// Ambil tanggal AKHIR dari teks periode Devpost → ISO (23:59 lokal).
// Format yang dikenal:
//   "Oct 28 - 30, 2026"           (bulan sama)
//   "Sep 25 - Oct 30, 2026"       (beda bulan, tahun sama)
//   "Aug 23, 2026 - Jan 02, 2027" (beda tahun)
//   "Oct 30, 2026"                (satu hari)

function parseDevpostDeadline(text) {

    if (!text) {
        return "";
    }

    const parts = text.split(/\s+-\s+/);

    const startPart = parts[0];

    const endPart = parts[parts.length - 1];

    const endMatch = endPart.match(
        /^(?:([A-Za-z]{3})[a-z]*\s+)?(\d{1,2}),?\s+(\d{4})/
    );

    if (!endMatch) {
        return "";
    }

    const [, endMonthName, day, year] = endMatch;

    let monthName = endMonthName;

    // "Oct 28 - 30, 2026": bulan akhir tidak ditulis → ikut bulan awal.

    if (!monthName) {

        const startMatch = startPart.match(/^([A-Za-z]{3})/);

        monthName = startMatch?.[1];
    }

    const month = MONTHS_EN[(monthName || "").toLowerCase()];

    if (month === undefined) {
        return "";
    }

    const date = new Date(
        Number(year), month, Number(day), 23, 59, 0
    );

    if (
        date.getMonth() !== month ||
        date.getDate() !== Number(day)
    ) {
        return "";
    }

    return date.toISOString();
}

// ==============================
// KONVERSI ITEM API → OBJEK LOMBA
// ==============================

function stripHtml(text) {

    return String(text || "")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeImage(url) {

    if (!url) {
        return "";
    }

    return url.startsWith("//") ? `https:${url}` : url;
}

function isOpenToIndonesia(hackathon) {

    const location = (
        hackathon.displayed_location?.location || ""
    ).toLowerCase();

    return (
        location.includes("online") ||
        location.includes("indonesia")
    );
}

function mapHackathon(hackathon) {

    const deadline = parseDevpostDeadline(
        hackathon.submission_period_dates
    );

    if (!deadline || !hackathon.url) {
        return null;
    }

    const themes = (hackathon.themes || [])
        .map(theme => theme.name)
        .filter(Boolean);

    const prize = stripHtml(hackathon.prize_amount);

    const location =
        hackathon.displayed_location?.location || "Online";

    return {

        title: hackathon.title,
        link: hackathon.url,
        imageUrl: normalizeImage(hackathon.thumbnail_url),

        organizer: hackathon.organization_name || "Tidak disebutkan",
        target: "Umum (Global)",
        fee: "Gratis",
        location,
        period: hackathon.submission_period_dates || "",

        snippet:
            `Hackathon ${location} di Devpost. ` +
            (themes.length ? `Tema: ${themes.join(", ")}. ` : "") +
            (prize ? `Hadiah: ${prize}.` : ""),

        labels: ["hackathon", ...themes],

        deadline,

        global: true,

        source: "Devpost"
    };
}

// Hackathon kecil (komunitas/sekolah lokal) umumnya tidak relevan
// untuk peserta Indonesia — hanya yang cukup ramai dan masih punya
// waktu cukup untuk ikut yang diambil.

function isWorthPosting(hackathon, deadline) {

    const registrations = Number(hackathon.registrations_count) || 0;

    const daysLeft =
        (new Date(deadline).getTime() - Date.now()) /
        (24 * 60 * 60 * 1000);

    return registrations >= MIN_REGISTRATIONS &&
        daysLeft >= MIN_DAYS_LEFT;
}

function parseDevpostResponse(data) {

    return (data?.hackathons || [])
        .filter(hackathon =>
            !hackathon.invite_only && isOpenToIndonesia(hackathon)
        )
        .map(hackathon => {

            const competition = mapHackathon(hackathon);

            if (
                !competition ||
                !isWorthPosting(hackathon, competition.deadline)
            ) {
                return null;
            }

            return competition;
        })
        .filter(Boolean);
}

// ==============================
// AMBIL HACKATHON DARI DEVPOST
// ==============================

async function fetchPage(page) {

    const response = await withRetry(
        () => axios.get(API_URL, {
            timeout: 15000,
            headers: HEADERS,
            params: {
                "status[]": "open",
                order_by: "deadline",
                per_page: PER_PAGE,
                page
            }
        }),
        {
            retries: 2,
            baseDelayMs: 1000,
            label: `Devpost halaman ${page}`
        }
    );

    return parseDevpostResponse(response.data);
}

async function getDevpostCompetitions() {

    try {

        const pages = [];

        for (let page = 1; page <= PAGES; page++) {
            pages.push(await fetchPage(page));
        }

        const seen = new Set();

        const competitions = pages.flat().filter(competition => {

            if (seen.has(competition.link)) {
                return false;
            }

            seen.add(competition.link);

            return true;
        });

        console.log(
            `Devpost menemukan ${competitions.length} hackathon online.`
        );

        return competitions;

    } catch (error) {

        console.error(
            "Gagal mengambil data dari Devpost:",
            error.message
        );

        return [];
    }
}

module.exports = {
    getDevpostCompetitions,
    parseDevpostDeadline,
    parseDevpostResponse
};
