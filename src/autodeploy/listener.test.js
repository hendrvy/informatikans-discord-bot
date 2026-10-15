const crypto = require("crypto");

// Secret harus diset SEBELUM require, karena listener membaca env
// saat modul di-load lewat config.js.

process.env.WEBHOOK_SECRET = "test-secret";

const { verifySignature } = require("./listener");


function makeReq(signature) {

    return { headers: signature ? { "x-hub-signature-256": signature } : {} };
}


function sign(body) {

    return (
        "sha256=" +
        crypto.createHmac("sha256", "test-secret").update(body).digest("hex")
    );
}


describe("autodeploy verifySignature", () => {

    test("signature valid diterima", () => {

        const body = JSON.stringify({ ref: "refs/heads/main" });

        expect(verifySignature(makeReq(sign(body)), body)).toBe(true);
    });

    test("signature salah ditolak", () => {

        const body = JSON.stringify({ ref: "refs/heads/main" });

        expect(verifySignature(makeReq(sign("body-lain")), body)).toBe(false);
    });

    test("tanpa header signature ditolak", () => {

        const body = "{}";

        expect(verifySignature(makeReq(null), body)).toBe(false);
    });

    test("signature dengan format rusak ditolak (bukan crash)", () => {

        expect(
            verifySignature(makeReq("bukan-hex"), "{}")
        ).toBe(false);
    });
});
