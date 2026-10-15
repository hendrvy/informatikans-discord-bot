const { parseDuration } = require("./remindme");
const { parseAnswers } = require("./poll");
const { decideResult, CHOICES } = require("./rps");
const { decodeHtml } = require("./trivia");


describe("remindme parseDuration", () => {

    test("menit sederhana", () => {

        expect(parseDuration("10m")).toBe(10 * 60 * 1000);
    });

    test("jam & hari", () => {

        expect(parseDuration("2h")).toBe(2 * 60 * 60 * 1000);
        expect(parseDuration("1d")).toBe(24 * 60 * 60 * 1000);
    });

    test("gabungan unit", () => {

        expect(parseDuration("1d 12h 30m")).toBe(
            (24 * 60 + 12 * 60 + 30) * 60 * 1000
        );
    });

    test("huruf besar diterima (dinormalisasi)", () => {

        expect(parseDuration("10M")).toBe(10 * 60 * 1000);
    });

    test("format salah mengembalikan null", () => {

        expect(parseDuration("abc")).toBeNull();
        expect(parseDuration("10")).toBeNull();
        expect(parseDuration("10x")).toBeNull();
        expect(parseDuration("m10")).toBeNull();
        expect(parseDuration("")).toBeNull();
    });

    test("nilai nol mengembalikan null", () => {

        expect(parseDuration("0m")).toBeNull();
    });
});


describe("poll parseAnswers", () => {

    test("tanpa opsi -> default ya/tidak", () => {

        expect(parseAnswers(undefined)).toEqual(["Ya", "Tidak"]);
        expect(parseAnswers("   ")).toEqual(["Ya", "Tidak"]);
    });

    test("memecah koma & membuang spasi/entri kosong", () => {

        expect(parseAnswers("Kopi, Teh , , Susu")).toEqual([
            "Kopi",
            "Teh",
            "Susu"
        ]);
    });

    test("maksimal 10 opsi", () => {

        const answers = parseAnswers(
            Array.from({ length: 15 }, (_, i) => `opsi${i + 1}`).join(", ")
        );

        expect(answers).toHaveLength(10);
    });
});


describe("rps decideResult", () => {

    test("seri jika pilihan sama", () => {

        for (const choice of Object.keys(CHOICES)) {
            expect(decideResult(choice, choice)).toBe("draw");
        }
    });

    test("batu menang atas gunting", () => {

        expect(decideResult("rock", "scissors")).toBe("a");
        expect(decideResult("scissors", "rock")).toBe("b");
    });

    test("kertas menang atas batu", () => {

        expect(decideResult("paper", "rock")).toBe("a");
        expect(decideResult("rock", "paper")).toBe("b");
    });

    test("gunting menang atas kertas", () => {

        expect(decideResult("scissors", "paper")).toBe("a");
        expect(decideResult("paper", "scissors")).toBe("b");
    });
});


describe("trivia decodeHtml", () => {

    test("mengubah entitas HTML umum", () => {

        expect(decodeHtml("A &amp; B")).toBe("A & B");
        expect(decodeHtml("&lt;script&gt;")).toBe("<script>");
        expect(decodeHtml("&quot;kutip&quot;")).toBe("\"kutip\"");
        expect(decodeHtml("&#039;apostrofe&#039;")).toBe("'apostrofe'");
    });

    test("teks polos tidak berubah", () => {

        expect(decodeHtml("Halo dunia")).toBe("Halo dunia");
    });
});
