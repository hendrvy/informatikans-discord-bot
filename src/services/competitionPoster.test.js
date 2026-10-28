const { createCompetitionEmbed } = require("./competitionPoster");

const {
    extractCompetitionsFromFeed,
    extractImageUrl
} = require("../sources/infolombaIt");

const {
    extractCompetitionsFromHtml
} = require("../sources/infolombaId");

const BASE = {
    title: "Hackathon Mahasiswa 2026",
    link: "https://example.com/lomba"
};

describe("createCompetitionEmbed (poster)", () => {

    test("memasang poster sebagai image embed", () => {

        const embed = createCompetitionEmbed({
            ...BASE,
            imageUrl: "https://example.com/poster.png"
        });

        expect(embed.toJSON().image.url)
            .toBe("https://example.com/poster.png");
    });

    test("tanpa imageUrl → embed tetap valid tanpa gambar", () => {

        const embed = createCompetitionEmbed(BASE);

        expect(embed.toJSON().image).toBeUndefined();
    });

    test("imageUrl bukan http(s) diabaikan", () => {

        const embed = createCompetitionEmbed({
            ...BASE,
            imageUrl: "javascript:alert(1)"
        });

        expect(embed.toJSON().image).toBeUndefined();
    });
});

describe("extractImageUrl (InfoLombaIT)", () => {

    test("ambil gambar pertama dan naikkan ukuran ke s1000", () => {

        const html =
            '<p><img src="https://blogger.googleusercontent.com/img/b/abc/s320/poster.png" width="320"/></p>';

        expect(extractImageUrl(html, ""))
            .toBe("https://blogger.googleusercontent.com/img/b/abc/s1000/poster.png");
    });

    test("format w320-h180 juga dinaikkan", () => {

        const html =
            '<img src="https://blogger.googleusercontent.com/img/b/abc/w320-h180/poster.png"/>';

        expect(extractImageUrl(html, ""))
            .toContain("/s1000/");
    });

    test("tanpa <img> → pakai thumbnail feed", () => {

        expect(
            extractImageUrl(
                "<p>teks saja</p>",
                "https://blogger.googleusercontent.com/img/b/abc/s72-c/t.png"
            )
        ).toBe("https://blogger.googleusercontent.com/img/b/abc/s1000/t.png");
    });

    test("tidak ada gambar sama sekali → string kosong", () => {

        expect(extractImageUrl("<p>teks</p>", undefined)).toBe("");
    });

    test("src relatif / non-http ditolak", () => {

        expect(extractImageUrl('<img src="data:image/png;base64,AAA"/>', ""))
            .toBe("");
    });

    test("extractCompetitionsFromFeed menyertakan imageUrl", () => {

        const feed = {
            feed: {
                entry: [{
                    title: { $t: "Lomba A" },
                    link: [{ rel: "alternate", href: "https://x.com/a" }],
                    content: {
                        $t: '<img src="https://blogger.googleusercontent.com/img/b/q/s320/a.png"/>isi'
                    }
                }]
            }
        };

        const [item] = extractCompetitionsFromFeed(feed);

        expect(item.imageUrl)
            .toBe("https://blogger.googleusercontent.com/img/b/q/s1000/a.png");
    });
});

describe("extractCompetitionsFromHtml (InfoLomba.id poster)", () => {

    const card = poster => `
        <div class="event-container">
            <div class="img-container"
                 onclick="loadDetailsEvent(99, 'info-x', this)">
                <img src="${poster}" alt="">
            </div>
            <div class="description">
                <h4 class="event-title"><a onclick="loadDetailsEvent(99, 'info-x', this)">Lomba X</a></h4>
                <div class="details"></div>
            </div>
        </div>`;

    test("path relatif diubah jadi URL absolut", () => {

        const [item] = extractCompetitionsFromHtml(
            card("images/event/poster/lomba-x-99.png")
        );

        expect(item.imageUrl)
            .toBe("https://infolomba.id/images/event/poster/lomba-x-99.png");
    });

    test("spasi di nama file di-encode", () => {

        const [item] = extractCompetitionsFromHtml(
            card("images/event/poster/lomba x.png")
        );

        expect(item.imageUrl)
            .toBe("https://infolomba.id/images/event/poster/lomba%20x.png");
    });

    test("nama file yang sudah ter-encode tidak di-encode dua kali", () => {

        const [item] = extractCompetitionsFromHtml(
            card("images/event/poster/lomba%20x.png")
        );

        expect(item.imageUrl)
            .toBe("https://infolomba.id/images/event/poster/lomba%20x.png");
    });
});
