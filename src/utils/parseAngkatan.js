// ==============================
// PARSE ANGKATAN DARI PESAN PERKENALAN
// ==============================
//
// Menerima teks pesan perkenalan, mencari baris yang mengandung kata
// "angkatan", lalu mengekstrak angka tahun dan menormalisasinya ke
// format role 2 digit, contoh: "Akt'26".
//
// Format yang didukung pada baris angkatan:
//   angkatan: 2026        -> Akt'26
//   angkatan: 26          -> Akt'26
//   angkatan : '26        -> Akt'26
//   angkatan - akt 2024   -> Akt'24
//
// Mengembalikan null jika tidak ditemukan angka yang valid.


function normalizeYearToRoleName(rawNumber) {

    const digits = rawNumber.replace(/\D/g, "");

    if (digits.length === 4) {

        const year = parseInt(digits, 10);

        if (year < 2000 || year > 2099) {
            return null;
        }

        return `Akt'${digits.slice(2)}`;
    }

    if (digits.length === 2) {

        const twoDigit = parseInt(digits, 10);

        if (twoDigit < 0 || twoDigit > 99) {
            return null;
        }

        return `Akt'${digits}`;
    }

    return null;
}


function findAngkatanLine(message) {

    if (!message) {
        return null;
    }

    const lines = message.split("\n");

    const angkatanLine = lines.find(line =>
        line.toLowerCase().includes("angkatan")
    );

    return angkatanLine || null;
}


function parseAngkatan(message) {

    const line = findAngkatanLine(message);

    if (!line) {
        return null;
    }

    const match = line.match(/(\d{2,4})/);

    if (!match) {
        return null;
    }

    return normalizeYearToRoleName(match[1]);
}


module.exports = {
    parseAngkatan
};
