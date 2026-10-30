// ==============================
// AI ENRICHER LOMBA (GEMINI + FALLBACK)
// ==============================
//
// Lapis kedua setelah competitionFilter. Tugasnya memperkaya data
// lomba sebelum diposting:
//   - deadline pendaftaran (ISO, untuk embed & tombol 🔔)
//   - kategori, biaya, target peserta, deskripsi singkat
//   - link pendaftaran langsung (jika ada di konten)
//
// Hybrid: kalau GEMINI_API_KEY tersedia dan kuota belum habis, data
// diekstrak lewat Gemini (gemini-2.0-flash, structured JSON output).
// Jika API key kosong, kuota habis, atau request gagal → fallback
// penuh ke ekstraksi rule-based (regex tanggal & link Indonesia).
//
// Kuota AI dibatasi LOMBA_MAX_AI_CALLS panggilan per siklus supaya
// free tier tidak terbakar saat banyak lomba sekaligus.

const axios = require("axios");

const config = require("../config");


const GEMINI_MODEL = "gemini-2.0-flash";

const GEMINI_URL =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    `${GEMINI_MODEL}:generateContent`;

const HEADERS = {
    "Content-Type": "application/json"
};

// Konten blog/feed bisa sangat panjang — cukup 4000 karakter awal
// untuk ekstraksi (deadline & link pendaftaran selalu di bagian awal).

const MAX_CONTENT_CHARS = 4000;

// 429 / kuota habis → matikan AI sampai siklus berikutnya.

const QUOTA_ERROR_CODES = [429, 403];


// ==============================
// BUDGET AI PER SIKLUS
// ==============================

let aiCallsUsed = 0;

let aiQuotaExhausted = false;

function resetAiBudget() {

    aiCallsUsed = 0;

    aiQuotaExhausted = false;
}

function getAiBudgetInfo() {

    return {
        used: aiCallsUsed,
        max: config.lombaMaxAiCalls,
        exhausted: aiQuotaExhausted
    };
}


// ==============================
// PARSING TANGGAL INDONESIA
// ==============================

const MONTHS_ID = {
    januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
    juli: 6, agustus: 7, september: 8, oktober: 9, november: 10,
    desember: 11,

    // Singkatan umum
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6,
    agu: 7, ags: 7, sep: 8, sept: 8, okt: 9, nov: 10, des: 11
};

// "15 Oktober 2026", "1-30 September 2026", "15-16 Agustus 2026"
// Range ditangkap: tanggal kedua (batas akhir) yang dipakai.

const TEXT_DATE_PATTERN =
    /(\d{1,2})\s*(?:-|–|—|s\.?d\.?|sampai|hingga|to)\s*(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})|(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})/g;

// "15/10/2026", "2026-10-15", "15.10.2026"

const NUM_DATE_PATTERN =
    /(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[/.\-](\d{1,2})[/.\-](20\d{2})/g;

function monthFromName(name) {

    return MONTHS_ID[name.toLowerCase()] ?? null;
}

function makeDate(year, monthIndex, day) {

    const date = new Date(
        Number(year), monthIndex, Number(day),
        23, 59, 0
    );

    // Valid: 30 Februari akan rollover ke Maret — cek agar tidak
    // salah tangkap.

    if (
        date.getFullYear() !== Number(year) ||
        date.getMonth() !== monthIndex ||
        date.getDate() !== Number(day)
    ) {
        return null;
    }

    return date;
}

// Kumpulkan semua tanggal yang bisa diparse dari satu segmen teks.

function collectDates(text) {

    const dates = [];

    for (const match of text.matchAll(TEXT_DATE_PATTERN)) {

        // Range "1-30 September 2026" → pakai batas akhir.

        const [, startDay, endDay, monthName, year,
            singleDay, singleMonth, singleYear] = match;

        if (singleDay) {

            const month = monthFromName(singleMonth);

            if (month !== null) {

                const date = makeDate(
                    singleYear, month, singleDay
                );

                if (date) {
                    dates.push(date);
                }
            }

        } else {

            const month = monthFromName(monthName);

            if (month !== null) {

                const date = makeDate(
                    year, month, endDay || startDay
                );

                if (date) {
                    dates.push(date);
                }
            }
        }
    }

    for (const match of text.matchAll(NUM_DATE_PATTERN)) {

        // ISO "2026-10-15"

        if (match[1]) {

            const date = makeDate(
                match[1], Number(match[2]) - 1, match[3]
            );

            if (date) {
                dates.push(date);
            }

        } else {

            // "15/10/2026" → format Indonesia DD/MM/YYYY.

            const date = makeDate(
                match[6], Number(match[5]) - 1, match[4]
            );

            if (date) {
                dates.push(date);
            }
        }
    }

    return dates;
}

// Segmen teks yang relevan untuk deadline.

const DEADLINE_KEYWORDS =
    /deadline|pendaftaran|registrasi|registration|daftar tutup|ditutup|close[sd]?|last day/i;

// Ekstraksi deadline rule-based:
// 1. Tanggal terbaru yang muncul di segmen mengandung kata kunci
//    deadline/pendaftaran.
// 2. Fallback: tanggal terbaru di seluruh teks yang masih di masa
//    depan (kalau tidak ada segmen keyword sama sekali).

function extractDeadlineFromText(text) {

    if (!text) {
        return "";
    }

    const segments = text
        .split(/\n|•|·|\||  /)
        .map(segment => segment.trim())
        .filter(Boolean);

    let keywordLatest = null;
    let overallLatest = null;

    for (const segment of segments) {

        const segmentDates = collectDates(segment);

        if (segmentDates.length === 0) {
            continue;
        }

        const segmentLatest = new Date(
            Math.max(...segmentDates.map(date => date.getTime()))
        );

        if (DEADLINE_KEYWORDS.test(segment)) {

            if (!keywordLatest ||
                segmentLatest > keywordLatest) {
                keywordLatest = segmentLatest;
            }

        } else if (!overallLatest || segmentLatest > overallLatest) {

            overallLatest = segmentLatest;
        }
    }

    // Satu kalimat panjang tanpa newline bisa menggabungkan keyword
    // dan tanggal di segmen yang sama — kalau tidak ada, coba
    // seluruh teks sebagai satu segmen.

    if (!keywordLatest) {

        const allDates = collectDates(text);

        if (allDates.length > 0) {

            // Keyword ada di teks global? Pakai tanggal terakhir.

            if (DEADLINE_KEYWORDS.test(text)) {

                keywordLatest = new Date(
                    Math.max(...allDates.map(date => date.getTime()))
                );
            }
        }
    }

    const chosen =
        keywordLatest ||
        (overallLatest && overallLatest.getTime() > Date.now()
            ? overallLatest
            : null);

    return chosen ? chosen.toISOString() : "";
}


// ==============================
// EKSTRAKSI LINK PENDAFTARAN
// ==============================

const REGISTRATION_LINK_KEYWORDS =
    /daftar|pendaftaran|registration|register|form/i;

// Link yang jelas BUKAN halaman pendaftaran.

const EXCLUDED_LINK_PATTERN =
    /infolomba\.id|infolombait\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|t\.me|whatsapp\.com|wa\.me|bit\.ly\/(follow|ig)/i;

function extractRegistrationLink(competition, content) {

    if (!content) {
        return "";
    }

    const links =
        content.match(/https?:\/\/[^\s"'<>)\]]+/g) || [];

    const cleanLinks = links
        .map(link => link.replace(/[.,;]+$/, ""))
        .filter(link =>
            !EXCLUDED_LINK_PATTERN.test(link));

    // 1. Link di segmen yang menyebut daftar/pendaftaran.

    for (const segment of content.split(/\n/)) {

        if (!REGISTRATION_LINK_KEYWORDS.test(segment)) {
            continue;
        }

        const segmentLink = cleanLinks.find(link =>
            segment.includes(link));

        if (segmentLink) {
            return segmentLink;
        }
    }

    // 2. Link pertama yang bukan media sosial / portal sumber.

    return cleanLinks[0] || "";
}


// ==============================
// FALLBACK RULE-BASED
// ==============================

const RULE_CATEGORY_MAP = [
    ["ctf", "Cyber Security / CTF"],
    ["capture the flag", "Cyber Security / CTF"],
    ["cyber", "Cyber Security / CTF"],
    ["keamanan", "Cyber Security / CTF"],
    ["hackathon", "Hackathon"],
    ["programming", "Competitive Programming"],
    ["coding", "Competitive Programming"],
    ["data", "Data Science / Analytics"],
    ["ux", "UI/UX Design"],
    ["ui", "UI/UX Design"],
    ["design", "Design"],
    ["desain", "Design"],
    ["game", "Game Development"],
    ["iot", "IoT / Smart Device"],
    ["smart", "IoT / Smart Device"],
    ["ai", "Artificial Intelligence"],
    ["machine learning", "Artificial Intelligence"],
    ["essay", "Esai Teknologi"],
    ["esai", "Esai Teknologi"],
    ["paper", "Paper / KTI"],
    ["karya tulis", "Paper / KTI"],
    ["web", "Web Development"],
    ["mobile", "Mobile Development"],
    ["network", "Jaringan / Network"],
    ["jaringan", "Jaringan / Network"]
];

function guessCategory(competition) {

    const text = [
        competition.title,
        competition.labels?.join(" "),
        competition.snippet
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    for (const [keyword, category] of RULE_CATEGORY_MAP) {

        if (new RegExp(`\\b${keyword}\\b`).test(text)) {
            return category;
        }
    }

    return "Teknologi Informasi";
}

function enrichRuleBased(competition) {

    const content =
        competition.content ||
        competition.snippet ||
        "";

    // Sumber terstruktur (Devpost, CTFtime) sudah menyediakan
    // deadline ISO — tidak perlu ditebak dari teks.

    const deadline =
        competition.deadline ||
        extractDeadlineFromText(
            [
                competition.period,
                content,
                competition.snippet
            ]
                .filter(Boolean)
                .join("\n")
        );

    // Deskripsi: pakai teks yang lebih panjang antara snippet &
    // konten — snippet feed sudah 300 char pertama konten, tapi
    // snippet kartu InfoLomba kadang cuma info deadline singkat.

    const descriptionBase = [
        competition.snippet || "",
        content
    ].reduce((longest, text) =>
        text.length > longest.length ? text : longest
    , "");

    return {

        ...competition,

        deadline,

        category: guessCategory(competition),

        fee: competition.fee || "",

        target: competition.target || "",

        description: descriptionBase
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 300),

        registrationLink:
            extractRegistrationLink(competition, content),

        aiEnriched: false
    };
}


// ==============================
// ENRICH VIA GEMINI
// ==============================

function buildAiPrompt(competition) {

    const content =
        (
            competition.content ||
            competition.snippet ||
            ""
        ).substring(0, MAX_CONTENT_CHARS);

    return [
        "Kamu asisten yang mengekstrak info kompetisi/lomba dari teks Indonesia.",
        "Ekstrak data lomba berikut. Jawab HANYA dengan JSON valid sesuai skema:",
        '{"kategori":string,"deadline":string,"biaya":string,"target":string,"deskripsi":string,"link_pendaftaran":string,"is_tech":boolean,"is_indonesia":boolean}',
        "Aturan:",
        '- kategori: salah satu dari "Cyber Security / CTF", "Hackathon", "Competitive Programming", "Data Science / Analytics", "UI/UX Design", "Design", "Game Development", "IoT / Smart Device", "Artificial Intelligence", "Esai Teknologi", "Paper / KTI", "Web Development", "Mobile Development", "Jaringan / Network", "Teknologi Informasi". Pilih yang paling cocok.',
        '- deadline: tanggal TUTUP pendaftaran dalam format YYYY-MM-DD, string kosong jika tidak disebut.',
        '- biaya: contoh "Gratis", "Rp 100.000/tim", atau string kosong jika tidak disebut.',
        '- target: contoh "Mahasiswa", "SMA/Sederajat", "Umum", atau string kosong.',
        '- deskripsi: ringkasan maksimal 250 karakter dalam bahasa Indonesia.',
        '- link_pendaftaran: URL pendaftaran langsung yang ada di teks (bukan media sosial), atau string kosong.',
        "- is_tech: false jika lomba BUKAN bidang teknologi (mis. lomba puisi, fotografi, bisnis umum).",
        "- is_indonesia: false jika lomba tidak untuk peserta Indonesia.",
        "",
        "JUDUL: " + (competition.title || ""),
        "SUMBER LABELS: " + (competition.labels?.join(", ") || ""),
        "TARGET KARTU: " + (competition.target || "tidak disebut"),
        "BIAYA KARTU: " + (competition.fee || "tidak disebut"),
        "PERIODE KARTU: " + (competition.period || "tidak disebut"),
        "KONTEN:",
        content
    ].join("\n");
}

async function enrichWithAi(competition) {

    // Kuota habis di siklus ini / key kosong / budget habis →
    // fallback tanpa mencoba AI lagi.

    if (
        !config.geminiApiKey ||
        aiQuotaExhausted ||
        aiCallsUsed >= config.lombaMaxAiCalls
    ) {
        return null;
    }

    aiCallsUsed++;

    try {

        const response = await axios.post(
            `${GEMINI_URL}?key=${config.geminiApiKey}`,

            {
                contents: [{
                    parts: [{
                        text: buildAiPrompt(competition)
                    }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 700,
                    responseMimeType: "application/json"
                }
            },

            {
                timeout: 25000,
                headers: HEADERS
            }
        );

        const text =
            response.data?.candidates?.[0]?.content
                ?.parts?.[0]?.text;

        if (!text) {
            return null;
        }

        const data = JSON.parse(text);

        // AI menilai tidak relevan → tolak lomba ini.

        if (
            data.is_tech === false ||
            (data.is_indonesia === false && !competition.global)
        ) {
            return { rejected: true };
        }

        // Normalisasi deadline AI ke ISO (bisa "2026-10-15"
        // atau teks Indonesia).

        let deadline = competition.deadline || data.deadline || "";

        if (deadline && !competition.deadline) {

            const parsed = new Date(deadline);

            deadline = isNaN(parsed.getTime())
                ? extractDeadlineFromText(deadline)
                : new Date(
                    parsed.getFullYear(),
                    parsed.getMonth(),
                    parsed.getDate(),
                    23, 59, 0
                ).toISOString();
        }

        return {

            ...competition,

            deadline,

            category: data.kategori || "Teknologi Informasi",

            fee: data.biaya || competition.fee || "",

            target: data.target || competition.target || "",

            description:
                (data.deskripsi ||
                competition.snippet ||
                "")
                    .replace(/\s+/g, " ")
                    .trim()
                    .substring(0, 300),

            registrationLink:
                data.link_pendaftaran ||
                extractRegistrationLink(
                    competition,
                    competition.content ||
                    competition.snippet ||
                    ""
                ),

            aiEnriched: true
        };

    } catch (error) {

        const status = error.response?.status;

        // Kuota/free tier habis → berhenti pakai AI di siklus ini.

        if (status && QUOTA_ERROR_CODES.includes(status)) {

            aiQuotaExhausted = true;

            console.warn(
                "⚠️ Kuota Gemini habis — fallback rule-based " +
                "untuk sisa siklus ini."
            );

        } else {

            console.warn(
                `⚠️ Gemini gagal (${error.message}) — ` +
                "pakai fallback rule-based untuk lomba ini."
            );
        }

        return null;
    }
}


// ==============================
// API PUBLIK
// ==============================

// Enrich satu lomba. Selalu mengembalikan lomba ter-enrich, KECUALI
// lomba ditolak AI (bukan tech / bukan Indonesia) → null.

async function enrichCompetition(competition) {

    let enriched = await enrichWithAi(competition);

    if (enriched?.rejected) {

        console.log(
            `🤖 AI menolak (bukan lomba IT Indonesia): ` +
            competition.title
        );

        return null;
    }

    if (!enriched) {
        enriched = enrichRuleBased(competition);
    }

    return enriched;
}


module.exports = {
    enrichCompetition,
    enrichRuleBased,
    extractDeadlineFromText,
    extractRegistrationLink,
    guessCategory,
    resetAiBudget,
    getAiBudgetInfo
};
