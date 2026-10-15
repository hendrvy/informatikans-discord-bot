// ==============================
// WEBHOOK AUTO-DEPLOY LISTENER
// ==============================
//
// Listener ini jalan DI DALAM proses bot (bukan proses terpisah),
// supaya tidak butuh pm2/shell access di server panel.
//
// Alur deploy:
//   GitHub push ke main  →  POST /webhook
//     → verifikasi secret (kalau WEBHOOK_SECRET diisi)
//     → git pull
//     → npm install --omit=dev
//     → process.exit(0)  → panel (Pterodactyl/dll.) restart otomatis
//       → bot hidup lagi, kali ini dengan kode baru
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

const PORT = config.webhookPort;
const WEBHOOK_PATH = config.webhookPath;
const WEBHOOK_SECRET = config.webhookSecret;
const BRANCH = config.webhookBranch;

const PROJECT_DIR = path.resolve(__dirname, "../..");

// Timeout tiap langkah deploy (git pull / npm install). npm install
// bisa lambat, jadi diberi jatah lebih besar.

const GIT_TIMEOUT_MS = 60 * 1000;
const NPM_TIMEOUT_MS = 5 * 60 * 1000;

// Jeda minimal antar deploy (proteksi dorongan webhook beruntun).

const DEPLOY_COOLDOWN_MS = 15 * 1000;

let deploying = false;

let lastDeployAt = 0;

let pendingDeploy = false;


// ==============================
// VERIFIKASI SIGNATURE GITHUB
// ==============================
// Header X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(secret, body).
// Lewatkan WEBHOOK_SECRET di .env untuk mengaktifkan.

function verifySignature(req, rawBody) {

    if (!WEBHOOK_SECRET) {
        return true; // secret belum diisi, skip verifikasi
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

async function deploy() {

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

            // Gagal pull: JANGAN exit. Bot lama tetap jalan, jangan
            // risiko mati tanpa kode baru yang terpasang.

            console.error(
                "[autodeploy] git pull gagal, deploy dibatalkan:",
                pull.stderr
            );

            return;
        }

        if (/Already up to date/i.test(pull.stdout)) {

            console.log("[autodeploy] tidak ada perubahan, skip deploy.");

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

        console.log("[autodeploy] deploy selesai, restart bot...");

        // Kasih waktu log terkirim dulu, lalu exit supaya panel
        // me-restart proses dengan kode yang baru.

        setTimeout(() => process.exit(0), 500);

    } finally {

        lastDeployAt = Date.now();

        deploying = false;

        // Selama deploy/coolown tadi masih ada push masuk, jalankan
        // sekali lagi untuk memastikan tidak ada commit yang ketinggalan.

        if (pendingDeploy) {

            pendingDeploy = false;

            setTimeout(() => deploy().catch(() => {}), DEPLOY_COOLDOWN_MS);
        }
    }
}


// ==============================
// HTTP SERVER
// ==============================

const server = http.createServer((req, res) => {

    // Health check sederhana.

    if (req.method === "GET" && req.url === "/health") {

        res.writeHead(200, { "Content-Type": "application/json" });

        return res.end(JSON.stringify({ status: "ok", deploying }));
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

        let payload;

        try {

            payload = JSON.parse(rawBody);

        } catch {

            res.writeHead(400);

            return res.end("invalid json");
        }

        // Balas 200 dulu ke GitHub sebelum proses deploy, biar
        // tidak kena timeout dari sisi GitHub.

        res.writeHead(200);

        res.end("ok");

        const event = req.headers["x-github-event"];

        const branch = payload.ref
            ? payload.ref.replace("refs/heads/", "")
            : null;

        if (event === "push" && branch === BRANCH) {

            console.log(
                `[autodeploy] push terdeteksi di branch '${branch}', deploy...`
            );

            deploy().catch((error) => {

                console.error("[autodeploy] error deploy:", error.message);
            });

        } else {

            console.log(
                `[autodeploy] diabaikan: event=${event} branch=${branch}`
            );
        }
    });

    req.on("error", () => {

        // Klien menutup koneksi duluan, tidak fatal.
    });
});


function startAutoDeploy() {

    server.listen(PORT, () => {

        console.log(
            `[autodeploy] webhook listener aktif di port ${PORT}${WEBHOOK_PATH} (branch: ${BRANCH})`
        );
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


module.exports = { startAutoDeploy, deploy, verifySignature };
