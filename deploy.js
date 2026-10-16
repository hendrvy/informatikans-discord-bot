"use strict";

// ==============================
// SUPERVISOR / DEPLOY AGENT
// ==============================
//
// Ini satu-satunya proses yang distart Pterodactyl, jadi dia TIDAK BOLEH
// exit sendiri: kalau dia mati, container ditandai offline. Dia tidak
// membuka port sama sekali.
//
// Bot (src/index.js) jalan sebagai child process. Child inilah yang
// membuka port webhook dan connect ke Discord, dan child inilah yang
// di-kill + respawn supaya kode baru kepakai.
//
//   node deploy.js
//    └─ deploy.js      supervisor: tidak pernah exit, pegang git + npm
//        └─ src/index.js   bot: Discord client + webhook listener
//
// Alur deploy:
//   push ke GitHub → webhook/poll → cek SHA remote vs lokal
//     → git pull (atau download tarball)
//     → npm install --omit=dev (hanya kalau package-lock.json berubah)
//     → restart child dengan SIGTERM (graceful, bot tutup DB dulu)
//
// Kalau ada langkah yang gagal, child yang lama TETAP jalan dan state
// tidak diajukan, jadi poll berikutnya otomatis mencoba lagi.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");

const ROOT = __dirname;
const CHILD_PATH = path.join(ROOT, "src", "index.js");
const CONFIG_PATH = path.join(ROOT, "deploy.config.json");
const STATE_PATH = path.join(ROOT, ".deploy-state.json");
const LOCK_PATH = path.join(ROOT, "package-lock.json");
const SRC_DIR = path.join(ROOT, "src");

const DEFAULT_REPO = "hendrvy/informatikans-discord-bot";

// Path yang TIDAK BOLEH ketimpa saat extract tarball. .env dan src/data/
// isinya state lokal yang tidak ada di GitHub; kalau ketimpa, token
// hilang dan database job hilang.
const PROTECTED_PATHS = [
    ".git",
    ".env",
    "node_modules",
    "src/data",
    "deploy.config.json",
    ".deploy-state.json"
];

// Timeout tiap langkah. npm install bisa lambat (better-sqlite3 native),
// jadi dikasih jatah jauh lebih besar.
const GIT_TIMEOUT_MS = 60 * 1000;
const NPM_TIMEOUT_MS = 5 * 60 * 1000;

// Bot perlu waktu untuk disconnect dari gateway Discord dan menutup
// SQLite (WAL) dengan rapi. SIGKILL di tengah write = database corrupt.
const SHUTDOWN_GRACE_MS = 10 * 1000;

const log = (...args) =>
    console.log(`[${new Date().toISOString()}] [deploy]`, ...args);


// ==============================
// CONFIG & STATE
// ==============================

function loadConfig() {
    let file = {};

    if (fs.existsSync(CONFIG_PATH)) {
        try {
            file = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
        } catch (err) {
            // Config rusak jangan bikin supervisor mati.
            log("deploy.config.json bukan JSON valid, diabaikan:", err.message);
        }
    }

    const int = (value, fallback) => {
        const n = Number.parseInt(value, 10);
        return Number.isFinite(n) ? n : fallback;
    };

    return {
        repo: process.env.GITHUB_REPO || file.repo || DEFAULT_REPO,
        branch:
            process.env.GITHUB_BRANCH ||
            process.env.WEBHOOK_BRANCH ||
            file.branch ||
            "main",
        secret: process.env.WEBHOOK_SECRET || file.secret || "",
        // Pterodactyl membagikan port lewat SERVER_PORT.
        port: int(
            process.env.SERVER_PORT ||
                process.env.PORT ||
                process.env.WEBHOOK_PORT ||
                file.port,
            9000
        ),
        webhookPath:
            process.env.WEBHOOK_PATH || file.webhookPath || "/webhook",
        pollSeconds: int(
            process.env.POLL_SECONDS || file.pollSeconds,
            120
        )
    };
}

function loadState() {
    try {
        if (fs.existsSync(STATE_PATH)) {
            return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
        }
    } catch (err) {
        log("gagal membaca .deploy-state.json:", err.message);
    }
    return {};
}

function saveState(next) {
    try {
        fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2));
        state = next;
    } catch (err) {
        log("gagal menulis .deploy-state.json:", err.message);
    }
}

const config = loadConfig();
let state = loadState();


// ==============================
// HELPER
// ==============================

function hashFile(file) {
    try {
        return crypto
            .createHash("sha1")
            .update(fs.readFileSync(file))
            .digest("hex");
    } catch {
        return "";
    }
}

// Hash seluruh kode bot (src/**/*.js, kecuali test) jadi satu sidik jari.
// Dipakai untuk memutuskan perlu restart atau tidak: kalau cuma README
// atau file test yang berubah, hash ini tidak bergerak → tanpa restart.
function hashSource(dir = SRC_DIR) {
    const hash = crypto.createHash("sha1");

    const walk = (current) => {
        let entries;
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            const full = path.join(current, entry.name);
            const rel = path.relative(ROOT, full).split(path.sep).join("/");

            if (isProtected(rel)) continue;

            if (entry.isDirectory()) {
                walk(full);
                continue;
            }

            if (!entry.name.endsWith(".js")) continue;
            if (entry.name.endsWith(".test.js")) continue;

            hash.update(rel);
            try {
                hash.update(fs.readFileSync(full));
            } catch {
                // File hilang di tengah walk, abaikan.
            }
        }
    };

    walk(dir);
    return hash.digest("hex");
}

function isProtected(rel) {
    return PROTECTED_PATHS.some(
        (p) => rel === p || rel.startsWith(`${p}/`)
    );
}

function run(cmd, args, opts = {}) {
    const { timeoutMs, ...spawnOpts } = opts;

    return new Promise((resolve) => {
        const child = spawn(cmd, args, {
            cwd: ROOT,
            shell: false,
            ...spawnOpts
        });

        let stdout = "";
        let stderr = "";
        let timer = null;
        let timedOut = false;

        if (timeoutMs) {
            timer = setTimeout(() => {
                timedOut = true;
                child.kill("SIGKILL");
            }, timeoutMs);
        }

        child.stdout?.on("data", (d) => (stdout += d));
        child.stderr?.on("data", (d) => (stderr += d));

        // Binary tidak ada jangan sampai throw.
        child.on("error", (err) => {
            if (timer) clearTimeout(timer);
            resolve({ ok: false, code: -1, stdout, stderr: err.message });
        });

        child.on("close", (code) => {
            if (timer) clearTimeout(timer);
            resolve({
                ok: code === 0 && !timedOut,
                code,
                stdout: stdout.trim(),
                stderr: timedOut
                    ? `timeout setelah ${timeoutMs}ms`
                    : stderr.trim()
            });
        });
    });
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const repoUrl = () => `https://github.com/${config.repo}.git`;


// ==============================
// DETEKSI MODE + BOOTSTRAP GIT
// ==============================

let mode = "unknown";

// Folder ini awalnya cuma hasil copy (tidak ada .git), jadi git pull
// mustahil. Kalau git tersedia, kita jadikan repo asli di tempat:
// init + remote add origin + fetch + reset --hard. Sekali saja.
async function bootstrapGit() {
    log("folder ini bukan git repo, mencoba bootstrap...");

    const init = await run("git", ["init"], { timeoutMs: GIT_TIMEOUT_MS });
    if (!init.ok) {
        log("git init gagal:", init.stderr || init.code);
        return false;
    }

    // remote add gagal kalau origin sudah ada; set-url menangani keduanya.
    const added = await run("git", ["remote", "add", "origin", repoUrl()], {
        timeoutMs: GIT_TIMEOUT_MS
    });
    if (!added.ok) {
        await run("git", ["remote", "set-url", "origin", repoUrl()], {
            timeoutMs: GIT_TIMEOUT_MS
        });
    }

    const fetched = await run(
        "git",
        ["fetch", "origin", config.branch, "--depth", "1"],
        { timeoutMs: GIT_TIMEOUT_MS }
    );
    if (!fetched.ok) {
        log("git fetch gagal:", fetched.stderr || fetched.code);
        return false;
    }

    // Set HEAD + index ke FETCH_HEAD TANPA menyentuh working tree, supaya
    // kita bisa lihat file lokal mana yang beda dari versi GitHub.
    const reset = await run("git", ["reset", "FETCH_HEAD"], {
        timeoutMs: GIT_TIMEOUT_MS
    });
    if (!reset.ok) {
        log("git reset gagal:", reset.stderr || reset.code);
        return false;
    }

    const status = await run("git", ["status", "--porcelain"], {
        timeoutMs: GIT_TIMEOUT_MS
    });

    // Hanya file yang BERUBAH yang berbahaya. File untracked (.env dsb.)
    // dan file yang belum ada di disk aman — reset --hard akan mengambilnya.
    const modified = status.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("M"))
        .map((line) => line.replace(/^M+\s+/, ""));

    if (modified.length > 0 && process.env.ALLOW_DIRTY_BOOTSTRAP !== "true") {
        log("!! bootstrap dibatalkan: ada file lokal yang beda dari GitHub:");
        for (const file of modified) log(`!!   ${file}`);
        log("!! backup dulu perubahan itu, atau set ALLOW_DIRTY_BOOTSTRAP=true");
        log("!! untuk menimpanya.");

        // PENTING: jangan fallback ke tarball. Extract tarball justru akan
        // menimpa file-file yang baru saja kita lindungi di atas. Lebih
        // baik auto-deploy mati total tapi bot tetap jalan dengan kode
        // lokal yang utuh.
        return "dirty";
    }

    const hard = await run("git", ["reset", "--hard", "FETCH_HEAD"], {
        timeoutMs: GIT_TIMEOUT_MS
    });
    if (!hard.ok) {
        log("git reset --hard gagal:", hard.stderr || hard.code);
        return false;
    }

    log("bootstrap git selesai, repo siap dipakai");
    return true;
}

async function detectMode() {
    const git = await run("git", ["--version"]);
    const hasRepo = fs.existsSync(path.join(ROOT, ".git"));

    if (git.ok && hasRepo) {
        mode = "git";
        log(`memakai git (${git.stdout})`);
        return;
    }

    if (git.ok) {
        const result = await bootstrapGit();

        if (result === "dirty") {
            // Ada perubahan lokal yang belum di-backup. Matikan auto-deploy
            // supaya tidak ada yang ketimpa; bot tetap jalan seperti biasa.
            mode = "disabled";
            log("auto-deploy DIMATIKAN sampai perubahan lokal itu dibereskan");
            return;
        }

        mode = result ? "git" : "tarball";
        log(
            result
                ? "memakai git (hasil bootstrap)"
                : "bootstrap gagal, fallback ke download tarball"
        );
        return;
    }

    mode = "tarball";
    log("git tidak tersedia di container ini, fallback ke download tarball");
}


// ==============================
// SHA REMOTE / LOKAL
// ==============================

// Transport smart-HTTP milik git. Tanpa rate limit dan tanpa butuh binary
// git, jadi ini opsi paling bisa diandalkan di container terkunci.
async function shaFromGitProtocol() {
    const res = await fetch(`${repoUrl()}/info/refs?service=git-upload-pack`, {
        headers: { "User-Agent": "git/2.40.0" }
    });
    if (!res.ok) throw new Error(`info/refs merespons ${res.status}`);

    const body = await res.text();
    const match = body.match(
        new RegExp(`([0-9a-f]{40})\\s+refs/heads/${config.branch}(?![\\w/-])`)
    );
    if (!match) throw new Error(`branch ${config.branch} tidak ditemukan`);

    return match[1];
}

async function shaFromLsRemote() {
    const res = await run(
        "git",
        ["ls-remote", repoUrl(), `refs/heads/${config.branch}`],
        { timeoutMs: GIT_TIMEOUT_MS }
    );
    if (!res.ok || !res.stdout) {
        throw new Error(`ls-remote gagal: ${res.stderr || res.code}`);
    }
    return res.stdout.split(/\s+/)[0];
}

// Pilihan terakhir: 60 request/jam per IP, di shared hosting kuotanya
// sering sudah habis dipakai tenant lain.
async function shaFromApi() {
    const res = await fetch(
        `https://api.github.com/repos/${config.repo}/commits/${config.branch}`,
        {
            headers: {
                Accept: "application/vnd.github.sha",
                "User-Agent": "hmifbot-autodeploy"
            }
        }
    );
    if (!res.ok) throw new Error(`GitHub API merespons ${res.status}`);
    return (await res.text()).trim();
}

async function remoteSha() {
    const sources =
        mode === "git"
            ? [shaFromLsRemote, shaFromGitProtocol, shaFromApi]
            : [shaFromGitProtocol, shaFromApi];

    const errors = [];
    for (const source of sources) {
        try {
            const sha = await source();
            if (/^[0-9a-f]{40}$/.test(sha)) return sha;
            errors.push(`${source.name}: respons tak terduga "${sha}"`);
        } catch (err) {
            errors.push(`${source.name}: ${err.message}`);
        }
    }

    throw new Error(`tidak bisa membaca commit remote (${errors.join("; ")})`);
}

async function localSha() {
    if (mode === "git") {
        const res = await run("git", ["rev-parse", "HEAD"], {
            timeoutMs: GIT_TIMEOUT_MS
        });
        if (res.ok) return res.stdout;
    }
    return state.sha || "";
}


// ==============================
// PULL: GIT & TARBALL
// ==============================

function cstr(buf, start, len) {
    const sub = buf.subarray(start, start + len);
    const end = sub.indexOf(0);
    return sub.subarray(0, end === -1 ? sub.length : end).toString("utf8");
}

// Tar reader minimal: cukup untuk archive codeload GitHub yang isinya
// hanya directory dan file biasa.
function extractTar(buf, destDir, strip = 1) {
    const written = [];
    let off = 0;

    while (off + 512 <= buf.length) {
        const header = buf.subarray(off, off + 512);
        if (header.every((b) => b === 0)) break;

        const name = cstr(header, 0, 100);
        const prefix = cstr(header, 345, 155);
        const size = Number.parseInt(cstr(header, 124, 12).trim(), 8) || 0;
        const type = String.fromCharCode(header[156]);

        const dataStart = off + 512;
        off = dataStart + Math.ceil(size / 512) * 512;

        const full = prefix ? `${prefix}/${name}` : name;
        const parts = full.split("/").filter(Boolean).slice(strip);
        if (parts.length === 0) continue;

        const rel = parts.join("/");

        // Jangan pernah keluar dari folder tujuan, dan jangan pernah
        // menimpa file lokal yang tidak ada di GitHub.
        if (parts.includes("..") || isProtected(rel)) continue;

        const target = path.join(destDir, rel);

        if (type === "5") {
            fs.mkdirSync(target, { recursive: true });
            continue;
        }
        if (type !== "0" && type !== "\0") continue;

        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, buf.subarray(dataStart, dataStart + size));
        written.push(rel);
    }

    return written;
}

async function pullViaTarball(sha) {
    const url = `https://codeload.github.com/${config.repo}/tar.gz/${sha}`;
    const res = await fetch(url, {
        headers: { "User-Agent": "hmifbot-autodeploy" }
    });
    if (!res.ok) throw new Error(`codeload merespons ${res.status}`);

    const gz = Buffer.from(await res.arrayBuffer());
    const tar = zlib.gunzipSync(gz);
    const files = extractTar(tar, ROOT, 1);
    log(`extract ${files.length} file dari tarball`);
}

async function pullViaGit() {
    const fetched = await run(
        "git",
        ["fetch", "origin", config.branch, "--depth", "1"],
        { timeoutMs: GIT_TIMEOUT_MS }
    );
    if (!fetched.ok) {
        throw new Error(`git fetch gagal: ${fetched.stderr || fetched.code}`);
    }

    const reset = await run("git", ["reset", "--hard", "FETCH_HEAD"], {
        timeoutMs: GIT_TIMEOUT_MS
    });
    if (!reset.ok) {
        throw new Error(`git reset gagal: ${reset.stderr || reset.code}`);
    }

    log(reset.stdout || "working tree di-reset ke FETCH_HEAD");
}

async function installDeps() {
    log("package-lock.json berubah, menjalankan npm install --omit=dev...");

    const res = await run(npmCmd, ["install", "--omit=dev", "--no-audit", "--no-fund"], {
        timeoutMs: NPM_TIMEOUT_MS
    });

    if (!res.ok) {
        // better-sqlite3 itu native module. Kalau tidak ada prebuilt
        // binary untuk Node versi ini, npm butuh python3/make/g++ di
        // container — yang biasanya tidak ada di Pterodactyl.
        throw new Error(
            `npm install gagal: ${res.stderr || res.stdout || res.code}`
        );
    }

    log("npm install selesai");
}


// ==============================
// DEPLOY
// ==============================

let deploying = false;
let queued = null;

async function deploy(reason) {
    if (mode === "disabled") {
        log(`deploy dilewati (${reason}): auto-deploy dimatikan`);
        return { status: "disabled" };
    }

    if (deploying) {
        queued = reason;
        log(`deploy sedang jalan, follow-up diantrekan (${reason})`);
        return { status: "queued" };
    }

    deploying = true;

    try {
        log(`memeriksa update (${reason})`);

        const target = await remoteSha();
        const before = await localSha();

        if (before === target) {
            log(`sudah paling baru di ${target.slice(0, 7)}`);
            return { status: "up-to-date", sha: target };
        }

        log(
            `update: ${before ? `${before.slice(0, 7)} → ` : ""}${target.slice(0, 7)}`
        );

        const lockBefore = hashFile(LOCK_PATH);
        const srcBefore = hashSource();
        const selfBefore = hashFile(__filename);

        // `git reset --hard` menghapus file ter-track yang tidak ada di
        // remote. Selama deploy.js belum dipush ke GitHub, setiap pull
        // akan menghapus file ini sendiri: proses yang jalan masih aman
        // (sudah di memori), tapi restart berikutnya gagal total. Jadi
        // simpan salinannya dulu.
        const selfBackup = fs.readFileSync(__filename);

        if (mode === "git") {
            await pullViaGit();
        } else {
            await pullViaTarball(target);
        }

        if (!fs.existsSync(__filename)) {
            fs.writeFileSync(__filename, selfBackup);
            log("deploy.js terhapus oleh pull, dipulihkan dari backup");
            log("!! deploy.js belum ada di repo - commit & push supaya aman");
        }

        const lockChanged = hashFile(LOCK_PATH) !== lockBefore;
        const srcChanged = hashSource() !== srcBefore;
        const selfChanged = hashFile(__filename) !== selfBefore;

        if (lockChanged) {
            // Kalau install gagal, JANGAN restart dan JANGAN simpan state:
            // bot lama tetap jalan dengan node_modules yang masih cocok,
            // dan poll berikutnya akan mencoba lagi.
            await installDeps();
        }

        saveState({
            sha: target,
            lastDeploy: new Date().toISOString(),
            srcHash: hashSource(),
            lockHash: hashFile(LOCK_PATH),
            selfHash: hashFile(__filename)
        });

        if (selfChanged) {
            log(
                "!! deploy.js berubah - restart server dari panel Pterodactyl untuk menerapkannya"
            );
        }

        const needRestart = srcChanged || lockChanged;

        if (needRestart) {
            log("kode bot berubah, me-restart proses bot");
            await restartChild();
        } else {
            log("tidak ada kode bot yang berubah, bot tidak di-restart");
            sendState();
        }

        log(`deployed ${target.slice(0, 7)}`);
        return {
            status: "deployed",
            sha: target,
            restarted: needRestart,
            supervisorStale: selfChanged
        };
    } catch (err) {
        log("deploy gagal:", err.message);
        return { status: "error", error: err.message };
    } finally {
        deploying = false;
        if (queued) {
            const next = queued;
            queued = null;
            setTimeout(() => deploy(next), 500);
        }
    }
}


// ==============================
// CHILD PROCESS (BOT)
// ==============================

let child = null;
let restarting = false;
let crashes = 0;

function childEnv() {
    return {
        ...process.env,
        // Tanda bahwa bot jalan di bawah supervisor: listener akan
        // mengirim IPC daripada deploy sendiri lalu exit.
        HMIF_SUPERVISED: "true",
        HMIF_DEPLOY_CONFIG: JSON.stringify({
            repo: config.repo,
            branch: config.branch,
            secret: config.secret,
            port: config.port,
            webhookPath: config.webhookPath
        })
    };
}

function sendState() {
    if (child?.connected) {
        child.send({
            type: "state",
            sha: state.sha || "",
            lastDeploy: state.lastDeploy || null,
            mode
        });
    }
}

function startChild() {
    child = spawn(process.execPath, [CHILD_PATH], {
        cwd: ROOT,
        env: childEnv(),
        stdio: ["inherit", "inherit", "inherit", "ipc"]
    });

    child.on("message", (msg) => {
        if (msg?.type === "deploy") deploy(msg.reason || "webhook");
        if (msg?.type === "ready" || msg?.type === "state-request") sendState();
    });

    child.on("exit", (code, signal) => {
        if (restarting) return;

        crashes += 1;
        const wait = Math.min(30_000, 1000 * 2 ** (crashes - 1));
        log(
            `bot keluar (code ${code}, signal ${signal || "none"}), restart dalam ${wait / 1000}s`
        );
        setTimeout(startChild, wait);
    });

    // Kalau child bertahan hidup, anggap sehat dan reset counter.
    setTimeout(() => {
        if (child && !child.killed) crashes = 0;
    }, 60_000);
}

function restartChild() {
    return new Promise((resolve) => {
        if (!child) {
            startChild();
            return resolve();
        }

        restarting = true;
        const current = child;

        // Tunggu port benar-benar dilepas sebelum di-bind ulang.
        current.once("exit", () => {
            restarting = false;
            child = null;
            crashes = 0;
            startChild();
            resolve();
        });

        current.kill("SIGTERM");
        setTimeout(() => {
            if (current === child || !current.killed) current.kill("SIGKILL");
        }, SHUTDOWN_GRACE_MS);
    });
}


// ==============================
// BOOT
// ==============================

process.on("uncaughtException", (err) =>
    log("uncaught exception di supervisor:", err)
);
process.on("unhandledRejection", (err) =>
    log("unhandled rejection di supervisor:", err)
);

for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
        log(`menerima ${sig}, shutting down`);
        restarting = true;
        child?.kill("SIGTERM");
        setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS);
    });
}

(async () => {
    log(`repo ${config.repo} branch ${config.branch}`);
    log(`bot akan listen di port ${config.port}${config.webhookPath}`);

    if (!config.secret) {
        log("tidak ada webhook secret - /webhook akan menerima request tanpa signature");
    }

    await detectMode();
    startChild();

    if (mode === "disabled") {
        log("polling tidak dijalankan karena auto-deploy dimatikan");
    } else if (config.pollSeconds > 0) {
        log(`polling commit baru setiap ${config.pollSeconds}s`);
        setInterval(() => deploy("poll"), config.pollSeconds * 1000);
    }
})();
