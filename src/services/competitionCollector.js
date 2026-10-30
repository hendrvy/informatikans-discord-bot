// ==============================
// COLLECTOR LOMBA (GABUNGAN SEMUA SUMBER)
// ==============================
//
// Replika jobCollector.js untuk lomba IT. Menggabungkan hasil semua
// sumber, menghitung kegagalan berturut-turut per sumber untuk alert.

const { getInfoLombaCompetitions } = require("../sources/infolombaId");
const { getInfoLombaItCompetitions } = require("../sources/infolombaIt");
const { getSeedCompetitions } = require("../sources/competitionSeed");
const { getDevpostCompetitions } = require("../sources/devpost");
const { getCtftimeCompetitions } = require("../sources/ctftime");

// Jumlah kegagalan berturut-turut per sumber sebelum
// dianggap rusak dan memicu alert.

const FAILURE_THRESHOLD = 3;

// Status kegagalan per sumber: { nama: jumlahGagalBerturut }

const failureCounts = {
    InfoLomba: 0,
    InfoLombaIT: 0,
    Devpost: 0
};

// Sumber yang kosong adalah kondisi normal (seed yang edisinya sudah
// tutup, jadwal CTF kosong) — tidak dihitung sebagai kegagalan.

const QUIET_SOURCES = new Set(["Resmi", "CTFtime"]);

function recordSourceResult(source, itemCount) {

    if (QUIET_SOURCES.has(source)) {
        return false;
    }

    const previous = failureCounts[source] ?? 0;

    if (itemCount > 0) {

        failureCounts[source] = 0;
        return false;
    }

    failureCounts[source] = previous + 1;

    return failureCounts[source] === FAILURE_THRESHOLD;
}

function isTotalFailure(counts) {

    const entries = Object.entries(counts);

    return (
        entries.length > 0 &&
        entries.every(([, count]) => count >= FAILURE_THRESHOLD)
    );
}

// ==============================
// AMBIL SEMUA LOMBA
// ==============================

async function getCompetitions() {

    console.log("\n🏆 Mengambil lomba IT dari semua sumber...");

    const sources = [
        ["InfoLomba", getInfoLombaCompetitions],
        ["InfoLombaIT", getInfoLombaItCompetitions],
        ["Resmi", getSeedCompetitions],
        ["Devpost", getDevpostCompetitions],
        ["CTFtime", getCtftimeCompetitions]
    ];

    const results = await Promise.allSettled(
        sources.map(([, fetcher]) => fetcher())
    );

    const all = [];

    for (const [index, [name]] of sources.entries()) {

        const result = results[index];

        if (result.status === "fulfilled") {

            if (recordSourceResult(name, result.value.length)) {

                console.error(
                    `🚨 ALERT: Sumber lomba ${name} kosong ` +
                    `${FAILURE_THRESHOLD}x berturut-turut!`
                );
            }

            all.push(...result.value);

        } else {

            if (recordSourceResult(name, 0)) {

                console.error(
                    `🚨 ALERT: Sumber lomba ${name} error ` +
                    `${FAILURE_THRESHOLD}x berturut-turut!`
                );
            }

            console.error(
                "❌ Sumber lomba gagal:",
                result.reason?.message || result.reason
            );
        }
    }

    console.log(
        `📦 Total lomba dari semua sumber: ${all.length}`
    );

    return all;
}

module.exports = {
    getCompetitions,
    recordSourceResult,
    isTotalFailure,
    failureCounts
};
