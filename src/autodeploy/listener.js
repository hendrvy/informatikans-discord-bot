// ==============================
// WEBHOOK AUTO-DEPLOY LISTENER
// ==============================
//
// Listener ini jalan DI DALAM proses bot dan punya dua mode:
//
// 1. SUPERVISED (dipakai di produksi, lewat `node deploy.js`)
//    Webhook yang masuk diteruskan ke supervisor lewat IPC. Supervisor
//    yang melakukan git pull + npm install, lalu me-restart proses bot
//    ini dengan SIGTERM. Proses bot TIDAK exit sendiri.
//
//      GitHub push → POST /webhook → verifikasi secret
//        → process.send({ type: "deploy" }) → supervisor kerja
//
// 2. STANDALONE (fallback, kalau bot dijalankan langsung via `npm run bot`)
//    Tidak ada supervisor, jadi listener deploy sendiri seperti dulu:
//    git pull → npm install → process.exit(0) dan berharap panel
//    me-restart. Kurang andal, tapi lebih baik daripada tidak jalan.
//
// Semua langkah diberi "deploy lock" + timeout agar dua webhook yang
// datang berdekatan tidak menumpuk, dan hang tidak menggantung bot
// selamanya. Kalau git/npm gagal, proses TIDAK exit — bot lama tetap
// jalan sampai ada push berikutnya yang berhasil.

const http = require("http");
const crypto = require("crypto");
const { exec } = require("child_process");
const path = require("path");

const config = require("../config");


// Supervisor mengirim konfigurasi lewat env supaya port/secret/branch
// yang dipakai persis sama dengan yang dia pegang.
let supervisorConfig = {};

try {
    supervisorConfig = JSON.parse(process.env.HMIF_DEPLOY_CONFIG || "{}");
} catch {
    supervisorConfig = {};
}

// IPC channel hanya ada kalau proses ini di-spawn oleh supervisor.
const SUPERVISED =
    process.env.HMIF_SUPERVISED === "true" &&
    typeof process.send === "function";

const PORT = supervisorConfig.port || config.webhookPort;
const WEBHOOK_PATH = supervisorConfig.webhookPath || config.webhookPath;
const WEBHOOK_SECRET = supervisorConfig.secret || config.webhookSecret;
const BRANCH = supervisorConfig.branch || config.webhookBranch;

const PROJECT_DIR = path.resolve(__dirname, "../..");

// Timeout tiap langkah deploy (git pull / npm install). npm install
// bisa lambat, jadi diberi jatah lebih besar.

const GIT_TIMEOUT_MS = 60 * 1000;
const NPM_TIMEOUT_MS = 5 * 60 * 1000;

// Jarak minimum antar deploy, supaya push beruntun tidak jadi badai.

const DEPLOY_COOLDOWN_MS = 15 * 1000;

let deploying = false;
let pendingDeploy = false;
let lastDeployAt = 0;

// Status deploy terakhir, dikirim supervisor lewat IPC. Dipakai di
// endpoint /health supaya bisa dicek dari luar tanpa buka panel.
let deployState = { sha: "", lastDeploy: null, mode: "standalone" };

// Diisi src/index.js supaya /health bisa melaporkan bot benar-benar
// sudah connect ke Discord, bukan cuma proses hidup.
let readyCheck = () => false;

function setReadyCheck(fn) {
    if (typeof fn === "function") readyCheck = fn;
}


// ==============================
// VERIFIKASI SIGNATURE GITHUB
// ==============================
//
// GitHub mengirim X-Hub-Signature-256 = HMAC-SHA256(secret, rawBody).
// Kalau WEBHOOK_SECRET tidak diisi di .env, verifikasi dilewati.

function verifySignature(req, rawBody) {

    if (!WEBHOOK_SECRET) {
        return true;
    }

    const signature = req.headers["x-hub-signature-256"];

    if (!signature) {
        return false;
    }

    const digest =
        "sha256=" +
        crypto
            .createHmac("sha256", WEBHOOK_SECRET)
            .update(rawBody)
            .digest("hex");

    try {

        return crypto.timingSafeEqual(
            Buffer.from(digest),
            Buffer.from(signature)
        );

    } catch {

        return false; // panjang beda / format aneh
    }
}


// ==============================
// HELPER EXEC DENGAN TIMEOUT
// ==============================

function runCommand(command, timeoutMs) {

    return new Promise((resolve) => {

        exec(
            command,
            {
                cwd: PROJECT_DIR,
                timeout: timeoutMs,
                windowsHide: true
            },
            (error, stdout, stderr) => {

                resolve({
                    ok: !error,
                    stdout: (stdout || "").trim(),
                    stderr: (stderr || "").trim()
                });
            }
        );
    });
}


// ==============================
// DEPLOY
// ==============================

async function deploy(reason = "webhook") {

    // Mode supervised: supervisor punya logika deploy yang jauh lebih
    // lengkap (cek SHA, tarball fallback, restart graceful). Cukup
    // titip pesan, jangan kerja sendiri.

    if (SUPERVISED) {

        process.send({ type: "deploy", reason });

        console.log(
            `[autodeploy] deploy diteruskan ke supervisor (${reason}).`
        );

        return;
    }

    // Cooldown sederhana: kalau baru saja deploy, antre sekali saja.

    const now = Date.now();

    if (deploying) {
        pendingDeploy = true;
        console.log("[autodeploy] deploy sedang berjalan, diantrekan.");
        return;
    }

    if (now - lastDeployAt < DEPLOY_COOLDOWN_MS) {
        pendingDeploy = true;
        console.log("[autodeploy] cooldown aktif, diantrekan.");
        return;
    }

    deploying = true;

    try {

        console.log("[autodeploy] git pull...");

        const pull = await runCommand("git pull --ff-only", GIT_TIMEOUT_MS);

        console.log(pull.stdout || pull.stderr);

        if (!pull.ok) {

            // JANGAN exit: bot lama masih sehat.

            console.error(
                "[autodeploy] git pull gagal, deploy dibatalkan:",
                pull.stderr
            );

            return;
        }

        if (/already up to date/i.test(pull.stdout)) {

            console.log("[autodeploy] tidak ada commit baru.");

            return;
        }

        console.log("[autodeploy] npm install --omit=dev...");

        const install = await runCommand(
            "npm install --omit=dev",
            NPM_TIMEOUT_MS
        );

        if (!install.ok) {

            console.error(
                "[autodeploy] npm install gagal, deploy dibatalkan:",
                install.stderr
            );

            return;
        }

        console.log("[autodeploy] deploy selesai, keluar untuk restart...");

        // Beri jeda supaya log terkirim dulu, lalu exit supaya panel
        // me-restart proses dengan kode yang baru.

        setTimeout(() => process.exit(0), 500);

    } finally {

        lastDeployAt = Date.now();

        deploying = false;

        // Selama deploy/cooldown tadi masih ada push masuk, jalankan
        // sekali lagi untuk memastikan tidak ada commit yang ketinggalan.

        if (pendingDeploy) {

            pendingDeploy = false;

            setTimeout(() => deploy(reason).catch(() => {}), DEPLOY_COOLDOWN_MS);
        }
    }
}


// ==============================
// HTTP SERVER
// ==============================

function sendJson(res, status, body) {

    const payload = JSON.stringify(body);

    res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Content-Length": Buffer.byteLength(payload)
    });

    res.end(payload);
}


const server = http.createServer((req, res) => {

    // Health check: dipakai untuk memastikan deploy benar-benar nyangkut.

    if (req.method === "GET" && req.url === "/health") {

        return sendJson(res, 200, {
            status: "ok",
            uptime: Math.round(process.uptime()),
            ready: readyCheck(),
            deploying,
            supervised: SUPERVISED,
            sha: deployState.sha || null,
            lastDeploy: deployState.lastDeploy,
            mode: deployState.mode,
            branch: BRANCH,
            hasSecret: Boolean(WEBHOOK_SECRET),
            node: process.version
        });
    }

    if (req.method !== "POST" || !req.url.startsWith(WEBHOOK_PATH)) {

        res.writeHead(404);

        return res.end();
    }

    // Kumpulkan raw body (dibutuhkan untuk verifikasi signature).

    const chunks = [];

    let size = 0;

    req.on("data", (chunk) => {

        size += chunk.length;

        // GitHub payload maks ~25MB, tapi untuk push biasa jauh
        // lebih kecil. Tolak body yang tidak wajar (>5MB).

        if (size > 5 * 1024 * 1024) {

            req.destroy();

            return;
        }

        chunks.push(chunk);
    });

    req.on("end", () => {

        const rawBody = Buffer.concat(chunks).toString("utf8");

        if (!verifySignature(req, rawBody)) {

            console.warn("[autodeploy] signature tidak valid, ditolak.");

            res.writeHead(401);

            return res.end("invalid signature");
        }

        const event = req.headers["x-github-event"];

        // GitHub mengirim event 'ping' saat webhook pertama disimpan.

        if (event === "ping") {

            return sendJson(res, 200, { ok: true, pong: true });
        }

        let payload;

        try {

            payload = JSON.parse(rawBody);

        } catch {

            res.writeHead(400);

            return res.end("invalid json");
        }

        const branch = payload.ref
            ? payload.ref.replace("refs/heads/", "")
            : null;

        if (event !== "push" || branch !== BRANCH) {

            console.log(
                `[autodeploy] diabaikan: event=${event} branch=${branch}`
            );

            return sendJson(res, 202, {
                ignored: true,
                event,
                branch
            });
        }

        const pusher = payload.pusher?.name || payload.sender?.login || "unknown";

        console.log(
            `[autodeploy] push terdeteksi di branch '${branch}' oleh ${pusher}, deploy...`
        );

        // Balas GitHub dulu supaya delivery tidak timeout, baru kerja.

        sendJson(res, 202, {
            ok: true,
            deploying: true,
            branch
        });

        Promise.resolve(deploy(`webhook (${pusher})`)).catch((error) => {

            console.error("[autodeploy] error deploy:", error.message);
        });
    });

    req.on("error", () => {

        // Klien menutup koneksi duluan, tidak fatal.
    });
});


// Supervisor mengirim SHA/lastDeploy terbaru setiap selesai deploy.

if (SUPERVISED) {

    process.on("message", (msg) => {

        if (msg?.type === "state") {

            deployState = {
                sha: msg.sha || "",
                lastDeploy: msg.lastDeploy || null,
                mode: msg.mode || "supervised"
            };
        }
    });
}


function startAutoDeploy() {

    server.listen(PORT, () => {

        console.log(
            `[autodeploy] webhook listener aktif di port ${PORT}${WEBHOOK_PATH} (branch: ${BRANCH}, ${SUPERVISED ? "supervised" : "standalone"})`
        );

        // Minta state awal + kabari supervisor bahwa port sudah terbuka.

        if (SUPERVISED) process.send({ type: "ready" });
    });

    server.on("error", (error) => {

        // Port bentrok jangan bikin bot mati — autodeploy memang
        // fitur opsional.

        console.error(
            "[autodeploy] gagal memulai listener:",
            error.message
        );
    });
}


function stopAutoDeploy() {

    return new Promise((resolve) => {

        if (!server.listening) return resolve();

        server.close(() => resolve());
    });
}


module.exports = {
    startAutoDeploy,
    stopAutoDeploy,
    setReadyCheck,
    deploy,
    verifySignature
};
