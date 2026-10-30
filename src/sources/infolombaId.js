// ==============================
// SUMBER LOMBA: INFOLOMBA.ID
// ==============================
//
// Portal agregator lomba Indonesia. Daftar lomba diambil dari halaman
// /events?kategori=<id> untuk beberapa kategori teknologi — halaman
// ini dirender server-side, satu request per kategori per siklus.
//
// Kartu "Most Wanted" di carousel atas ikut ter-render di HTML yang sama;
// semuanya tidak ber-class event-container, jadi tidak terbaca scraper.

const axios = require("axios");
const cheerio = require("cheerio");
const { withRetry } = require("../utils/retry");

const BASE_URL = "https://infolomba.id";

// Kategori yang bisa berisi lomba teknologi di infolomba.id.
// Kategori IT (9) saja sering kosong; lomba UI/UX, robot, data,
// inovasi, dll. dikelompokkan terpisah. Penyaringan tech/non-tech
// tetap dilakukan competitionFilter.
//   9 IT, 44 UI/UX, 35 Robot, 58 Statistika/Data, 63 Inovasi,
//   21 Challenge, 41 Paper, 3 KTI, 2 Desain, 29 Teknik, 16 Lainnya
const KATEGORI_TECH = [9, 44, 35, 58, 63, 21, 41, 3, 2, 29, 16];

// Ambil detail singkat tiap lomba? Tidak — biaya request per lomba
// terlalu besar untuk siklus 6 jaman. Info kartu (target, biaya,
// periode, penyelenggara) sudah cukup untuk embed.

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/120.0.0.0 Safari/537.36",
    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "id-ID,id;q=0.9,en;q=0.8"
};

function cleanText(text) {

    if (!text) {
        return "";
    }

    return text
        .replace(/\s+/g, " ")
        .trim();
}

// ==============================
// EKSTRAKSI DAFTAR LOMBA
// ==============================

function extractCompetitionsFromHtml(html) {

    const $ = cheerio.load(html);

    const competitions = [];

    $(".event-container").each((index, element) => {

        const $card = $(element);

        // Kartu event-past (lomba sudah berakhir) dilewati.
        // Ada juga kartu Most Wanted (tanpa event-container) — sudah
        // otomatis tidak terpilih oleh selector ini.

        if ($card.hasClass("event-past")) {
            return;
        }

        const title = cleanText(
            $card.find("h4.event-title a").text()
        );

        // ID numerik lomba ada di onclick="loadDetailsEvent(2152, ...)
        // Link final = /info-<slug>-<id>

        const onclick = $card
            .find("[onclick*='loadDetailsEvent']")
            .attr("onclick") || "";

        const idMatch = onclick.match(/loadDetailsEvent\((\d+)/);

        if (!title || !idMatch) {
            return;
        }

        const competitionId = idMatch[1];

        const link =
            `${BASE_URL}/info-` +
            (title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")) +
            `-${competitionId}`;

        // Meta kartu: target peserta, biaya, lokasi, periode.

        const details = $card.find(".details");

        const target = cleanText(
            details.find(".target").text()
        );

        const fee = cleanText(
            details.find(".biaya").text()
        );

        const location = cleanText(
            details.find(".lokasi").text()
        );

        const period = cleanText(
            details.find(".tanggal").text()
        );

        const organizer = cleanText(
            details.find(".penyelenggara span").last().text()
        );

        // Poster: path relatif (images/event/poster/...) → URL absolut.

        const posterSrc = $card
            .find(".img-container img")
            .first()
            .attr("src");

        let imageUrl = "";

        if (posterSrc) {

            try {
                imageUrl = new URL(
                    encodeURI(decodeURI(posterSrc.trim())),
                    `${BASE_URL}/`
                ).href;
            } catch (error) {
                imageUrl = "";
            }
        }

        competitions.push({

            title,
            link,
            imageUrl,

            // Slug halaman detail dipakai untuk dedup antar-siklus.
            detailSlug: `info-...-${competitionId}`,
            competitionId,

            organizer: organizer || "Tidak disebutkan",
            target: target || "Tidak disebutkan",
            fee: fee || "Tidak disebutkan",
            location: location || "Indonesia",
            period: period || "",

            // Deskripsi pendek dari halaman detail nanti diperkaya
            // oleh aiEnricher / fallback rule-based.
            snippet: "",
            deadline: "",

            source: "InfoLomba"
        });
    });

    return competitions;
}

// ==============================
// AMBIL LOMBA DARI INFOLOMBA.ID
// ==============================

async function fetchKategori(kategori) {

    try {

        const response = await withRetry(
            () => axios.get(
                `${BASE_URL}/events?kategori=${kategori}`,
                { timeout: 15000, headers: HEADERS }
            ),
            {
                retries: 2,
                baseDelayMs: 1000,
                label: `InfoLomba scrape kategori ${kategori}`
            }
        );

        return extractCompetitionsFromHtml(response.data);

    } catch (error) {

        console.error(
            `Gagal mengambil infolomba.id kategori ${kategori}:`,
            error.message
        );

        return [];
    }
}

// Gabung semua kategori, buang duplikat (satu lomba bisa muncul
// di beberapa kategori).

function mergeUniqueById(lists) {

    const seen = new Set();

    const merged = [];

    for (const competition of lists.flat()) {

        if (seen.has(competition.competitionId)) {
            continue;
        }

        seen.add(competition.competitionId);

        merged.push(competition);
    }

    return merged;
}

async function getInfoLombaCompetitions() {

    const lists = await Promise.all(
        KATEGORI_TECH.map(fetchKategori)
    );

    const competitions = mergeUniqueById(lists);

    console.log(
        `InfoLomba menemukan ${competitions.length} lomba ` +
        `dari ${KATEGORI_TECH.length} kategori.`
    );

    return competitions;
}

module.exports = {
    getInfoLombaCompetitions,
    extractCompetitionsFromHtml,
    mergeUniqueById,
    KATEGORI_TECH
};
