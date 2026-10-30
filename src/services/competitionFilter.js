// ==============================
// FILTER RELEVANSI LOMBA IT
// ==============================
//
// Lapis pertama sebelum AI (hemat kuota API). Semua aturan murni
// deterministic supaya mudah di-test dengan Jest.
//
// Aturan:
// 1. WAJIB tech — judul/konten mengandung kata kunci teknologi.
// 2. WAJIB Indonesia — lomba ber-domain .id / penanda bahasa
//    Indonesia (semua sumber kami sudah Indonesia, tapi lapis ini
//    jaring pengaman untuk label/konten yang bocor dari luar).
// 3. SKOR prioritas mahasiswa (bukan hard filter — sesuai kebijakan
//    "prioritas mahasiswa"): hasil skor dipakai untuk urutan posting
//    dan field 🎓 Target di embed.

// Kata kunci teknologi (sesuai pola jobFilter.js techKeywords).
// Kata ambigu seperti "it" dan "ai" HARUS dicocokkan sebagai kata
// utuh (\b) — kalau substring, "it" match di "universitas"/"digital"
// dan "ai" match di "maintain", sehingga lomba non-tech ikut lolos.

const techKeywords = [
    // Umum
    "it", "teknologi informasi", "informatics", "informatika",
    "ilmu komputer", "computer science", "teknik komputer",

    // Kompetisi spesifik IT
    "hackathon", "programming", "competitive programming",
    "ctf", "capture the flag", "cyber security", "cybersecurity",
    "keamanan siber", "keamanan data",

    // Bidang
    "data mining", "data science", "data analytics", "big data",
    "machine learning", "artificial intelligence", "ai",
    "iot", "internet of things", "embedded", "robotik", "robotics",
    "smart city", "smart device",

    // Desain & web
    "ui design", "ux design", "ui/ux", "web design", "web development",
    "software development", "software engineering", "mobile app",
    "game development", "game dev", "network", "jaringan",
    "it network", "cloud computing", "devops"
];

// Pola regex gabungan: \b(kw1|kw2|...)\b — kata utuh, tidak peduli
// posisi di awal/tengah/akhir teks.

function escapeRegExp(text) {

    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TECH_PATTERN = new RegExp(
    `\\b(${techKeywords.map(escapeRegExp).join("|")})\\b`
);

// Penanda Indonesia (teks bahasa Indonesia atau domain .id).

const indonesiaMarkers = [
    "indonesia", "nasional", "mahasiswa", "siswa", "pelajar",
    "kampus", "universitas", "institut", "sekolah",
    "pendaftaran", "daftar sekarang", "gratis", "rupiah", " rp",
    "wib", "indonesia"
];

// Penanda target mahasiswa (untuk skor prioritas).

const mahasiswaMarkers = [
    "mahasiswa", "universitas", "institut", "sekolah tinggi",
    "perguruan tinggi", "kampus", "aktif semester", "s1", "skripsi",
    "undergraduate", "college", "sma/sederajat, mahasiswa"
];

// Penanda target siswa/khusus non-mahasiswa (penalti, bukan tolak).

const pelajarOnlyMarkers = [
    "sd / sederajat", "smp / sederajat", "pelajar", "sekolah"
];

// ==============================
// HELPERS
// ==============================

function buildText(competition) {

    return [
        competition.title,
        competition.snippet,
        competition.content,
        competition.labels?.join(" "),
        competition.organizer
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

function isTechCompetition(competition) {

    const text = buildText(competition);

    return TECH_PATTERN.test(text);
}

function isIndonesianCompetition(competition) {

    const text = buildText(competition);

    const hasMarker = indonesiaMarkers.some(marker =>
        text.includes(marker)
    );

    const isDotIdDomain =
        /\.id(\/|$)/i.test(competition.link || "");

    return hasMarker || isDotIdDomain;
}

// Skor prioritas mahasiswa (semakin tinggi semakin didahulukan).

function getMahasiswaScore(competition) {

    const text = buildText(competition);
    const target = (competition.target || "").toLowerCase();

    let score = 0;

    // Target eksplisit menyebut mahasiswa → skor tertinggi.

    if (target.includes("mahasiswa")) {
        score += 2;
    } else if (
        mahasiswaMarkers.some(marker => text.includes(marker))
    ) {
        score += 1;
    }

    // Target HANYA siswa (tanpa mahasiswa) → penalti.

    const targetHasMahasiswa =
        target.includes("mahasiswa") ||
        target.includes("umum");

    if (
        !targetHasMahasiswa &&
        pelajarOnlyMarkers.some(marker => target.includes(marker))
    ) {
        score -= 1;
    }

    return score;
}

// ==============================
// API PUBLIK
// ==============================

// Filter utama: hanya lomba IT Indonesia yang lolos.

// Sumber global (Devpost, CTFtime) menandai lomba dengan
// `global: true`: online & terbuka untuk peserta Indonesia, jadi
// syarat penanda Indonesia dilewati — syarat tech tetap berlaku.

function isRelevantCompetition(competition) {

    if (competition.global) {
        return isTechCompetition(competition);
    }

    return (
        isTechCompetition(competition) &&
        isIndonesianCompetition(competition)
    );
}

module.exports = {
    isRelevantCompetition,
    isTechCompetition,
    isIndonesianCompetition,
    getMahasiswaScore
};
