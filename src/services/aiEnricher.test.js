const {
    enrichCompetition,
    enrichRuleBased,
    extractDeadlineFromText,
    extractRegistrationLink,
    guessCategory
} = require("./aiEnricher");


describe("extractDeadlineFromText", () => {

    it("memparse tanggal tunggal bahasa Indonesia", () => {

        const deadline = extractDeadlineFromText(
            "Deadline pendaftaran: 15 Oktober 2026"
        );

        const date = new Date(deadline);

        expect(deadline).not.toBe("");

        expect(date.getUTCFullYear()).toBe(2026);

        expect(date.getUTCMonth()).toBe(9);

        expect(date.getUTCDate()).toBe(15);
    });

    it("memparse rentang tanggal & memakai batas akhir", () => {

        const deadline = extractDeadlineFromText(
            "Pendaftaran: 1-30 September 2026"
        );

        const date = new Date(deadline);

        expect(date.getUTCMonth()).toBe(8);

        expect(date.getUTCDate()).toBe(30);
    });

    it("memparse format numerik DD/MM/YYYY", () => {

        const deadline = extractDeadlineFromText(
            "Pendaftaran ditutup 15/10/2026"
        );

        const date = new Date(deadline);

        expect(date.getUTCMonth()).toBe(9);

        expect(date.getUTCDate()).toBe(15);
    });

    it("mengembalikan string kosong jika tidak ada tanggal", () => {

        expect(
            extractDeadlineFromText("Tidak ada tanggal di sini")
        ).toBe("");
    });

    it("mengabaikan tanggal lampau jika tidak ada keyword deadline", () => {

        // 2019 jelas lampau, dan tidak ada kata "deadline"/"pendaftaran".

        const deadline = extractDeadlineFromText(
            "Event diselenggarakan 10 Januari 2019 di Jakarta"
        );

        expect(deadline).toBe("");
    });
});


describe("extractRegistrationLink", () => {

    it("mengambil link dari baris pendaftaran", () => {

        const content =
            "Info lomba.\n" +
            "Daftar sekarang: https://forms.example.com/daftar\n" +
            "Follow IG kami https://instagram.com/contoh";

        expect(
            extractRegistrationLink(null, content)
        ).toBe("https://forms.example.com/daftar");
    });

    it("mengabaikan link media sosial & sumber portal", () => {

        const content =
            "Info: https://infolomba.id/info-lomba-1\n" +
            "IG: https://instagram.com/contoh";

        expect(
            extractRegistrationLink(null, content)
        ).toBe("");
    });
});


describe("guessCategory", () => {

    it("mengenali CTF", () => {

        expect(
            guessCategory({
                title: "CTF Championship 2026",
                labels: ["ctf"],
                snippet: ""
            })
        ).toBe("Cyber Security / CTF");
    });

    it("mengenali UI/UX", () => {

        expect(
            guessCategory({
                title: "Lomba Desain UX Nasional",
                labels: [],
                snippet: ""
            })
        ).toBe("UI/UX Design");
    });

    it("fallback ke kategori umum", () => {

        expect(
            guessCategory({
                title: "TEKNOCOM 2026",
                labels: [],
                snippet: ""
            })
        ).toBe("Teknologi Informasi");
    });
});


describe("enrichRuleBased", () => {

    it("melengkapi deadline, kategori & deskripsi dari konten", () => {

        const enriched = enrichRuleBased({
            title: "Hackathon Ilmu Komputer 2026",
            link: "https://infolomba.id/info-hack-1",
            snippet: "Pendaftaran dibuka sampai 20 November 2026.",
            content: "Hackathon untuk mahasiswa.\nDaftar: https://forms.example.com/hack",
            labels: ["hackathon"],
            organizer: "HMIF",
            target: "Mahasiswa",
            fee: "Gratis",
            period: ""
        });

        expect(enriched.deadline).not.toBe("");

        expect(enriched.category).toBe("Hackathon");

        expect(enriched.registrationLink)
            .toBe("https://forms.example.com/hack");

        expect(enriched.description).toContain("Hackathon");

        expect(enriched.aiEnriched).toBe(false);
    });
});
