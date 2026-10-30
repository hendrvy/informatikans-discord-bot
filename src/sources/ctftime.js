// ==============================
// SUMBER LOMBA: CTFTIME (CTF ONLINE GLOBAL)
// ==============================
//
// CTFtime menyediakan API JSON publik untuk jadwal CTF. Hanya CTF
// online, terbuka untuk umum, dan dimulai dalam waktu dekat yang
// diambil. Ditandai `global: true` karena penyelenggaranya bukan
// Indonesia. CTF tidak punya deadline daftar terpisah, jadi waktu
// selesai CTF dipakai sebagai deadline.

const axios = require("axios");
const { withRetry } = require("../utils/retry");

const API_URL = "https://ctftime.org/api/v1/events/";

// CTF yang mulai dalam rentang ini yang diambil.
const LOOKAHEAD_DAYS = 21;

// Bobot rating CTFtime — buang CTF kecil/tak berbobot.
const MIN_WEIGHT = 20;

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/120.0.0.0 Safari/537.36"
};

function mapEvent(event) {

    const url = event.url || event.ctftime_url;

    const finish = new Date(event.finish);

    if (!event.title || !url || isNaN(finish.getTime())) {
        return null;
    }

    const start = new Date(event.start);

    const startText = isNaN(start.getTime())
        ? ""
        : start.toISOString().slice(0, 10);

    const finishText = finish.toISOString().slice(0, 10);

    return {

        title: event.title,
        link: url,
        imageUrl: event.logo && /^https?:\/\//.test(event.logo)
            ? event.logo
            : "",

        organizer: event.organizers?.[0]?.name || "Tidak disebutkan",
        target: "Umum (Global)",
        fee: "Gratis",
        location: "Online",
        period: startText ? `${startText} - ${finishText}` : finishText,

        snippet:
            `CTF (Capture the Flag) online, format ${event.format || "-"}. ` +
            `Bobot CTFtime: ${event.weight}. ` +
            `Info: ${event.ctftime_url}`,

        labels: ["ctf", "cyber security"],

        deadline: finish.toISOString(),

        global: true,

        source: "CTFtime"
    };
}

function parseCtftimeResponse(events) {

    return (Array.isArray(events) ? events : [])
        .filter(event =>
            event.onsite === false &&
            event.restrictions === "Open" &&
            Number(event.weight) >= MIN_WEIGHT
        )
        .map(mapEvent)
        .filter(Boolean);
}

async function getCtftimeCompetitions() {

    try {

        const now = Math.floor(Date.now() / 1000);

        const response = await withRetry(
            () => axios.get(API_URL, {
                timeout: 15000,
                headers: HEADERS,
                params: {
                    limit: 100,
                    start: now,
                    finish: now + LOOKAHEAD_DAYS * 24 * 60 * 60
                }
            }),
            {
                retries: 2,
                baseDelayMs: 1000,
                label: "CTFtime"
            }
        );

        const competitions = parseCtftimeResponse(response.data);

        console.log(
            `CTFtime menemukan ${competitions.length} CTF online.`
        );

        return competitions;

    } catch (error) {

        console.error(
            "Gagal mengambil data dari CTFtime:",
            error.message
        );

        return [];
    }
}

module.exports = {
    getCtftimeCompetitions,
    parseCtftimeResponse
};
