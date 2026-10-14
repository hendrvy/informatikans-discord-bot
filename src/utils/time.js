// ==============================
// HELPER WAKTU (Asia/Jakarta)
// ==============================
//
// Menggantikan penggunaan `pytz` pada versi Python, memakai Intl API
// bawaan Node.js supaya tidak perlu menambah dependency baru.

const TIMEZONE = "Asia/Jakarta";


// ==============================
// PARSE "DD-MM-YYYY HH:MM" (dianggap sudah dalam waktu Asia/Jakarta)
// MENJADI Date (UTC instant yang benar)
// ==============================

function parseJakartaDateTime(text) {

    const match = text.match(
        /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/
    );

    if (!match) {
        return null;
    }

    const [, day, month, year, hour, minute] = match;

    // Asia/Jakarta = UTC+7, tidak ada DST, jadi konversi aman secara manual.
    const utcMs = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour) - 7,
        Number(minute)
    );

    const date = new Date(utcMs);

    if (isNaN(date.getTime())) {
        return null;
    }

    return date;
}


// ==============================
// FORMAT Date MENJADI "DD-MM-YYYY HH:MM" (waktu Asia/Jakarta)
// ==============================

function formatJakartaDateTime(date) {

    const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: TIMEZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    });

    const parts = formatter.formatToParts(date);

    const get = type =>
        parts.find(part => part.type === type)?.value;

    return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")}`;
}


module.exports = {
    TIMEZONE,
    parseJakartaDateTime,
    formatJakartaDateTime
};
