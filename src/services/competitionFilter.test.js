const {
    isRelevantCompetition,
    isTechCompetition,
    isIndonesianCompetition,
    getMahasiswaScore
} = require("./competitionFilter");


function makeCompetition(overrides = {}) {

    return {
        title: "Hackathon Nasional 2026",
        link: "https://infolomba.id/info-hackathon-nasional-2026-1234",
        snippet: "Kompetisi hackathon untuk mahasiswa se-Indonesia",
        content: "",
        labels: ["hackathon"],
        organizer: "HMIF Universitas Contoh",
        target: "Mahasiswa",
        ...overrides
    };
}


describe("isTechCompetition", () => {

    it("menerima lomba dengan judul mengandung kata kunci tech", () => {

        expect(
            isTechCompetition(makeCompetition())
        ).toBe(true);
    });

    it("menolak lomba non-tech (mis. lomba puisi)", () => {

        expect(
            isTechCompetition(makeCompetition({
                title: "Lomba Puisi Nasional",
                snippet: "Karya tulis puisi terbaik",
                labels: ["puisi"],
                organizer: "Sanggar Sastra"
            }))
        ).toBe(false);
    });

    it("mendeteksi tech lewat label blogger", () => {

        expect(
            isTechCompetition(makeCompetition({
                title: "TEKNOCOM 2026",
                snippet: "",
                labels: ["ctf", "software"],
                organizer: ""
            }))
        ).toBe(true);
    });
});


describe("isIndonesianCompetition", () => {

    it("menerima lomba dengan penanda Indonesia di teks", () => {

        expect(
            isIndonesianCompetition(makeCompetition())
        ).toBe(true);
    });

    it("menerima lomba ber-domain .id meski teks minim", () => {

        expect(
            isIndonesianCompetition(makeCompetition({
                snippet: "",
                content: "",
                labels: [],
                organizer: "",
                link: "https://lomba.example.id/info-1"
            }))
        ).toBe(true);
    });

    it("menolak lomba asing tanpa penanda Indonesia", () => {

        expect(
            isIndonesianCompetition(makeCompetition({
                title: "Global Coding Challenge",
                snippet: "Join us for the ultimate coding battle",
                content: "",
                labels: ["hackathon"],
                organizer: "Acme Corp",
                link: "https://example.org/global"
            }))
        ).toBe(false);
    });
});


describe("isRelevantCompetition", () => {

    it("lolos hanya jika tech DAN Indonesia", () => {

        const techIndo = makeCompetition();
        // Judul harus dioverride — judul default mengandung
        // "Nasional" yang termasuk penanda Indonesia.

        const techAsing = makeCompetition({
            title: "Acme Hackathon 2026",
            snippet: "Join our hackathon",
            content: "",
            organizer: "Acme",
            link: "https://example.org/hack"
        });
        const nonTechIndo = makeCompetition({
            title: "Lomba Fotografi Nasional",
            snippet: "Pendaftaran dibuka untuk mahasiswa Indonesia",
            labels: ["fotografi"],
            link: "https://infolomba.id/info-fotografi-9999"
        });

        expect(isRelevantCompetition(techIndo)).toBe(true);
        expect(isRelevantCompetition(techAsing)).toBe(false);
        expect(isRelevantCompetition(nonTechIndo)).toBe(false);
    });
});


describe("getMahasiswaScore", () => {

    it("skor tertinggi jika target eksplisit mahasiswa", () => {

        const score =
            getMahasiswaScore(makeCompetition({ target: "Mahasiswa" }));

        expect(score).toBeGreaterThanOrEqual(2);
    });

    it("skor menengah jika teks menyebut mahasiswa", () => {

        const score = getMahasiswaScore(makeCompetition({
            target: "",
            snippet: "Terbuka untuk mahasiswa aktif"
        }));

        expect(score).toBe(1);
    });

    it("penalti jika target hanya pelajar", () => {

        // Snippet & organizer dikosongkan karena default factory
        // menyebut "mahasiswa"/"universitas" yang memberi skor +1
        // dan menutupi penalti target.

        const score = getMahasiswaScore(makeCompetition({
            target: "SD / Sederajat, SMP / Sederajat",
            snippet: "",
            organizer: ""
        }));

        // Tidak ada penanda mahasiswa di teks (0) dan target hanya
        // SD/SMP → penalti -1.

        expect(score).toBeLessThan(0);
    });

    it("tanpa penalti jika target umum (mahasiswa bisa ikut)", () => {

        const score = getMahasiswaScore(makeCompetition({
            target: "Umum"
        }));

        expect(score).toBeGreaterThanOrEqual(0);
    });
});
