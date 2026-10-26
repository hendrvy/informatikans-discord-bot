// ==============================
// SUMBER LOMBA: LAMAN RESMI PENYELENGGARA (SEED)
// ==============================
//
// Kompetisi besar yang halamannya stabil dan resmi (bukan agregator).
// Dipakai sebagai "seed source": setiap siklus bot memastikan lomba
// besar ini sudah ada di arsip. Deadline diekstrak dari teks halaman.
//
// Catatan: GEMASTIK (gemastik.kemdiktisaintek.go.id) adalah SPA —
// konten dirender JavaScript sehingga tidak bisa di-scrape dengan
// cheerio. Untuk GEMASTIK, tambahkan manual lewat daftar di bawah
// saat periode pendaftarannya aktif.

const axios = require("axios");
const cheerio = require("cheerio");
const { withRetry } = require("../utils/retry");

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/120.0.0.0 Safari/537.36"
};

// Daftar seed: lomba besar yang layak selalu dicek.
// url = halaman resmi, keywords = penanda cabang/kategori.

const SEED_COMPETITIONS = [
    {
        title: "GEMASTIK (Pagelaran Mahasiswa Nasional Bidang TIK)",
        url: "https://gemastik.kemdiktisaintek.go.id/",
        organizer: "Kemdiktisaintek RI",
        keywords: [
            "programming", "cyber security", "data mining",
            "ux", "smart city", "iot"
        ],
        // SPA — scraper akan gagal; dilewati dengan aman.
        skipFetch: true
    },
    {
        title: "FindIT! UGM (Informatics Competition)",
        url: "https://find-it.id/",
        organizer: "KM IT UGM",
        keywords: [
            "competitive programming", "ctf", "data analytics",
            "ux", "hackathon"
        ],
        skipFetch: false
    }
];

// ==============================
// AMBIL SATU HALAMAN SEED
// ==============================

async function fetchSeedPage(seed) {

    if (seed.skipFetch) {
        return null;
    }

    try {

        const response = await withRetry(
            () => axios.get(
                seed.url,
                { timeout: 15000, headers: HEADERS }
            ),
            {
                retries: 2,
                baseDelayMs: 1000,
                label: `Seed ${seed.title}`
            }
        );

        const $ = cheerio.load(response.data);

        // Ambil seluruh teks halaman — cukup untuk mendeteksi
        // apakah pendaftaran aktif & menemukan tanggal.

        const pageText = $("body")
            .text()
            .replace(/\s+/g, " ")
            .trim();

        return {
            title: seed.title,
            link: seed.url,
            organizer: seed.organizer,
            target: "Mahasiswa",
            fee: "",
            location: "Indonesia",
            period: "",
            pageText,
            source: "Resmi"
        };

    } catch (error) {

        console.error(
            `Seed ${seed.title} gagal diambil:`,
            error.message
        );

        return null;
    }
}

async function getSeedCompetitions() {

    const results = await Promise.allSettled(
        SEED_COMPETITIONS.map(seed => fetchSeedPage(seed))
    );

    const competitions = [];

    for (const result of results) {

        if (result.status === "fulfilled" && result.value) {
            competitions.push(result.value);
        }
    }

    console.log(
        `Seed resmi mengembalikan ${competitions.length} halaman.`
    );

    return competitions;
}

module.exports = {
    getSeedCompetitions,
    SEED_COMPETITIONS
};
