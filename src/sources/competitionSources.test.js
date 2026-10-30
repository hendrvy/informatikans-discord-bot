const {
    parseDevpostDeadline,
    parseDevpostResponse
} = require("./devpost");

const { parseCtftimeResponse } = require("./ctftime");

const { mergeUniqueById } = require("./infolombaId");

const { parseSeedDeadline } = require("./competitionSeed");

const { recordSourceResult } = require("../services/competitionCollector");

const {
    isRelevantCompetition
} = require("../services/competitionFilter");


function localDate(iso) {

    const date = new Date(iso);

    return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
}


describe("parseDevpostDeadline", () => {

    it("bulan sama: 'Oct 28 - 30, 2026'", () => {

        expect(localDate(parseDevpostDeadline("Oct 28 - 30, 2026")))
            .toEqual([2026, 10, 30]);
    });

    it("beda bulan: 'Sep 25 - Oct 30, 2026'", () => {

        expect(localDate(parseDevpostDeadline("Sep 25 - Oct 30, 2026")))
            .toEqual([2026, 10, 30]);
    });

    it("beda tahun: 'Aug 23, 2026 - Jan 02, 2027'", () => {

        expect(
            localDate(parseDevpostDeadline("Aug 23, 2026 - Jan 02, 2027"))
        ).toEqual([2027, 1, 2]);
    });

    it("satu hari: 'Oct 30, 2026'", () => {

        expect(localDate(parseDevpostDeadline("Oct 30, 2026")))
            .toEqual([2026, 10, 30]);
    });

    it("teks tak dikenal → string kosong", () => {

        expect(parseDevpostDeadline("segera")).toBe("");
        expect(parseDevpostDeadline("")).toBe("");
    });
});


describe("parseDevpostResponse", () => {

    const base = {
        title: "Global AI Hackathon",
        url: "https://global-ai.devpost.com/",
        displayed_location: { location: "Online" },
        submission_period_dates: "Sep 25 - Dec 30, 2099",
        themes: [{ name: "Machine Learning/AI" }],
        thumbnail_url: "//cdn.example.com/a.png",
        organization_name: "Contoh",
        prize_amount: "$<span data-currency-value>50,000</span>",
        registrations_count: 1000,
        invite_only: false
    };

    it("memetakan hackathon online ke objek lomba global", () => {

        const [item] = parseDevpostResponse({ hackathons: [base] });

        expect(item.title).toBe("Global AI Hackathon");
        expect(item.global).toBe(true);
        expect(item.source).toBe("Devpost");
        expect(item.imageUrl).toBe("https://cdn.example.com/a.png");
        expect(item.snippet).toContain("$50,000");
        expect(localDate(item.deadline)).toEqual([2099, 12, 30]);
    });

    it("membuang hackathon onsite di luar Indonesia & invite-only", () => {

        const result = parseDevpostResponse({
            hackathons: [
                { ...base, displayed_location: { location: "Fort Worth" } },
                { ...base, invite_only: true }
            ]
        });

        expect(result).toHaveLength(0);
    });

    it("membuang hackathon sepi peminat", () => {

        const result = parseDevpostResponse({
            hackathons: [{ ...base, registrations_count: 20 }]
        });

        expect(result).toHaveLength(0);
    });

    it("membuang hackathon yang deadline-nya tinggal sebentar", () => {

        const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const month = soon.toLocaleString("en-US", { month: "short" });

        const result = parseDevpostResponse({
            hackathons: [{
                ...base,
                submission_period_dates:
                    `${month} ${soon.getDate()}, ${soon.getFullYear()}`
            }]
        });

        expect(result).toHaveLength(0);
    });

    it("menerima hackathon onsite di Indonesia", () => {

        const result = parseDevpostResponse({
            hackathons: [
                {
                    ...base,
                    displayed_location: { location: "Jakarta, Indonesia" }
                }
            ]
        });

        expect(result).toHaveLength(1);
    });
});


describe("parseCtftimeResponse", () => {

    const base = {
        title: "Contoh CTF 2026",
        url: "https://ctf.example.com/",
        ctftime_url: "https://ctftime.org/event/1/",
        onsite: false,
        restrictions: "Open",
        weight: 25,
        format: "Jeopardy",
        start: "2026-11-01T10:00:00+00:00",
        finish: "2026-11-03T10:00:00+00:00",
        organizers: [{ name: "Tim Contoh" }]
    };

    it("memetakan CTF online terbuka", () => {

        const [item] = parseCtftimeResponse([base]);

        expect(item.global).toBe(true);
        expect(item.source).toBe("CTFtime");
        expect(item.organizer).toBe("Tim Contoh");
        expect(item.deadline).toBe("2026-11-03T10:00:00.000Z");
    });

    it("membuang onsite, tertutup, dan bobot rendah", () => {

        const result = parseCtftimeResponse([
            { ...base, onsite: true },
            { ...base, restrictions: "Prequalified" },
            { ...base, weight: 0 }
        ]);

        expect(result).toHaveLength(0);
    });
});


describe("mergeUniqueById", () => {

    it("membuang lomba duplikat antar kategori", () => {

        const merged = mergeUniqueById([
            [{ competitionId: "1" }, { competitionId: "2" }],
            [{ competitionId: "2" }, { competitionId: "3" }]
        ]);

        expect(merged.map(item => item.competitionId))
            .toEqual(["1", "2", "3"]);
    });
});


describe("parseSeedDeadline", () => {

    it("mengubah YYYY-MM-DD ke ISO akhir hari", () => {

        expect(localDate(parseSeedDeadline("2026-03-10")))
            .toEqual([2026, 3, 10]);
    });

    it("format salah / kosong → string kosong", () => {

        expect(parseSeedDeadline("")).toBe("");
        expect(parseSeedDeadline("10 Maret")).toBe("");
        expect(parseSeedDeadline(undefined)).toBe("");
    });
});


describe("filter lomba global", () => {

    const global = {
        title: "Global AI Hackathon",
        link: "https://global-ai.devpost.com/",
        snippet: "Hackathon Online di Devpost.",
        labels: ["hackathon"],
        organizer: "Contoh",
        global: true
    };

    it("lolos tanpa penanda Indonesia", () => {

        expect(isRelevantCompetition(global)).toBe(true);
    });

    it("tanpa flag global, ditolak karena bukan Indonesia", () => {

        expect(
            isRelevantCompetition({ ...global, global: false })
        ).toBe(false);
    });

    it("global tetap wajib tech", () => {

        expect(
            isRelevantCompetition({
                ...global,
                title: "Global Poetry Contest",
                snippet: "Poems",
                labels: ["poetry"]
            })
        ).toBe(false);
    });
});


describe("recordSourceResult", () => {

    it("sumber 'quiet' kosong tidak memicu alert", () => {

        for (let i = 0; i < 5; i++) {
            expect(recordSourceResult("CTFtime", 0)).toBe(false);
        }
    });
});
