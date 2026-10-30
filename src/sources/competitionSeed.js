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

//
// deadline = batas akhir pendaftaran edisi berjalan (YYYY-MM-DD),
// diisi MANUAL karena halaman resmi jarang memuat tahun yang jelas.
// Seed dengan deadline yang sudah lewat otomatis dilewati checker,
// jadi cukup perbarui tanggalnya saat edisi baru dibuka.
// Seed tanpa deadline dan skipFetch tidak diposting (tidak ada data).

const SEED_COMPETITIONS = [
    {
        title: "GEMASTIK (Pagelaran Mahasiswa Nasional Bidang TIK)",
        url: "https://gemastik.kemdiktisaintek.go.id/",
        organizer: "Kemdiktisaintek RI",
        keywords: [
            "programming", "cyber security", "data mining",
            "ux", "smart city", "iot"
        ],
        // SPA — scraper akan gagal; isi deadline manual saat dibuka.
        skipFetch: true,
        deadline: ""
    },
    {
        title: "FindIT! UGM (Informatics Competition)",
        url: "https://find-it.id/",
        organizer: "KM IT UGM",
        keywords: [
            "competitive programming", "ctf", "data analytics",
            "ux", "hackathon"
        ],
        skipFetch: false,
        // Edisi 2026: pendaftaran 9 Feb - 10 Mar 2026
        deadline: "2026-03-10"
    },
    {
        title: "HOLOGY (Hology UB - Technology Competition)",
        url: "https://hology.ub.ac.id/",
        organizer: "Universitas Brawijaya",
        keywords: [
            "competitive programming", "ctf", "data mining",
            "ux", "hackathon"
        ],
        skipFetch: false,
        // Edisi 9.0: pendaftaran s.d. 8 Sep 2026
        deadline: "2026-09-08"
    }
];

// ==============================
// AMBIL SATU HALAMAN SEED
// ==============================

// "2026-03-10" → ISO akhir hari (23:59 lokal), "" jika tidak valid.

function parseSeedDeadline(deadline) {

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadline || "");

    if (!match) {
        return "";
    }

    const date = new Date(
        Number(match[1]), Number(match[2]) - 1, Number(match[3]),
        23, 59, 0
    );

    return isNaN(date.getTime()) ? "" : date.toISOString();
}

async function fetchSeedPage(seed) {

    const deadline = parseSeedDeadline(seed.deadline);

    // Seed yang edisinya sudah tutup tidak perlu di-fetch lagi.

    if (deadline && new Date(deadline).getTime() < Date.now()) {
        return null;
    }

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
            deadline,
            pageText,
            content: pageText.substring(0, 4000),
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
    parseSeedDeadline,
    SEED_COMPETITIONS
};
