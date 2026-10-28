// ==============================
// SUMBER LOMBA: INFOLOMBAIT.COM (FEED BLOGGER)
// ==============================
//
// Blog agregator khusus lomba IT Indonesia. Lebih stabil daripada
// scraping HTML: Blogger menyediakan feed JSON resmi yang berisi
// judul, link, kategori label, dan konten penuh (termasuk teks
// deadline & link pendaftaran) — tanpa perlu parsing HTML rapuh.

const axios = require("axios");
const { withRetry } = require("../utils/retry");

const FEED_URL =
    "https://www.infolombait.com/feeds/posts/default" +
    "?alt=json&max-results=15";

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/120.0.0.0 Safari/537.36"
};

// ==============================
// BERSIHKAN HTML JADI TEKS
// ==============================

function htmlToText(html) {

    if (!html) {
        return "";
    }

    return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\r/g, "")
        .trim();
}

// ==============================
// AMBIL URL POSTER
// ==============================
//
// Gambar pertama di konten postingan = poster. Blogger menyisipkan
// ukuran di path (/s320/ atau /w320-h180/) — dinaikkan ke /s1000/
// supaya poster tampil jelas di embed. Thumbnail feed (72px) hanya
// jadi cadangan.

function upgradeBloggerSize(url) {

    return url.replace(
        /\/(s\d+(-c)?|w\d+-h\d+(-[a-z]+)*)\//,
        "/s1000/"
    );
}

function extractImageUrl(contentHtml, thumbnailUrl) {

    const match = (contentHtml || "").match(
        /<img[^>]+src=["']([^"']+)["']/i
    );

    const candidate = match?.[1] || thumbnailUrl || "";

    if (!/^https?:\/\//i.test(candidate)) {
        return "";
    }

    return upgradeBloggerSize(candidate);
}

// ==============================
// EKSTRAKSI DARI FEED
// ==============================

function extractCompetitionsFromFeed(feedJson) {

    const entries =
        feedJson?.feed?.entry;

    if (!Array.isArray(entries)) {
        return [];
    }

    const competitions = [];

    for (const entry of entries) {

        const title =
            entry.title?.$t || "";

        const link =
            (entry.link || [])
                .find(item => item.rel === "alternate")
                ?.href || null;

        if (!title || !link) {
            continue;
        }

        const labels =
            (entry.category || [])
                .map(item => item.term)
                .filter(Boolean);

        const published =
            entry.published?.$t || "";

        const contentHtml =
            entry.content?.$t ||
            entry.summary?.$t ||
            "";

        const content = htmlToText(contentHtml);

        const imageUrl = extractImageUrl(
            contentHtml,
            entry["media$thumbnail"]?.url
        );

        competitions.push({

            title,
            link,
            imageUrl,

            organizer: "Info Lomba IT",
            target: "",
            fee: "",
            location: "Indonesia",
            period: "",

            labels,

            // Konten penuh postingan blog — sumber deadline & link
            // pendaftaran untuk aiEnricher / fallback rule-based.
            content,

            snippet:
                content.substring(0, 300),

            deadline: "",

            publishedDate: published,

            source: "InfoLombaIT"
        });
    }

    return competitions;
}

// ==============================
// AMBIL LOMBA DARI FEED
// ==============================

async function getInfoLombaItCompetitions() {

    try {

        const response = await withRetry(
            () => axios.get(
                FEED_URL,
                { timeout: 15000, headers: HEADERS }
            ),
            {
                retries: 3,
                baseDelayMs: 1000,
                label: "InfoLombaIT feed"
            }
        );

        const competitions =
            extractCompetitionsFromFeed(response.data);

        console.log(
            `InfoLombaIT menemukan ${competitions.length} lomba IT.`
        );

        return competitions;

    } catch (error) {

        console.error(
            "Gagal mengambil data dari infolombait.com:",
            error.message
        );

        return [];
    }
}

module.exports = {
    getInfoLombaItCompetitions,
    extractCompetitionsFromFeed,
    extractImageUrl,
    htmlToText
};
