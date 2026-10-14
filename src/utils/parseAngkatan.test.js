const { parseAngkatan } = require("./parseAngkatan");


describe("parseAngkatan", () => {

    it("mendeteksi format 'angkatan: 2026' menjadi Akt'26", () => {

        const message =
            "Nama: Budi\nNama panggilan: Budi\nAngkatan: 2026\nHobi: Coding\nMinat: Web";

        expect(parseAngkatan(message)).toBe("Akt'26");
    });

    it("mendeteksi format 'angkatan: 26' (2 digit) menjadi Akt'26", () => {

        const message = "angkatan: 26";

        expect(parseAngkatan(message)).toBe("Akt'26");
    });

    it("mendeteksi format dengan tanda petik 'angkatan: '24' menjadi Akt'24", () => {

        const message = "angkatan: '24";

        expect(parseAngkatan(message)).toBe("Akt'24");
    });

    it("mendeteksi kata 'akt' sebagai bagian dari baris angkatan", () => {

        const message = "angkatan - akt 2024";

        expect(parseAngkatan(message)).toBe("Akt'24");
    });

    it("mengembalikan null jika tidak ada baris 'angkatan' sama sekali", () => {

        const message = "Nama: Budi\nHobi: Coding";

        expect(parseAngkatan(message)).toBeNull();
    });

    it("mengembalikan null jika baris angkatan tidak mengandung angka", () => {

        const message = "angkatan: baru banget";

        expect(parseAngkatan(message)).toBeNull();
    });

    it("mengembalikan null jika tahun di luar rentang wajar (4 digit)", () => {

        const message = "angkatan: 1899";

        expect(parseAngkatan(message)).toBeNull();
    });

    it("tidak case-sensitive terhadap kata 'Angkatan'", () => {

        const message = "ANGKATAN: 2025";

        expect(parseAngkatan(message)).toBe("Akt'25");
    });

});
