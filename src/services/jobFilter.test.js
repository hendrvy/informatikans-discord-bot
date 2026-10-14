const { isRelevantInternship } = require("./jobFilter");

describe("isRelevantInternship", () => {

    describe("DevJobsIndo source", () => {

        it("menganggap relevan jika title mengandung kata kunci tech", () => {
            const job = {
                source: "DevJobsIndo",
                title: "Software Engineer Internship",
                summary: "",
                requirements: ""
            };

            expect(isRelevantInternship(job)).toBe(true);
        });

        it("menganggap tidak relevan jika tidak ada kata kunci tech sama sekali", () => {
            const job = {
                source: "DevJobsIndo",
                title: "Finance Intern",
                summary: "Membantu pencatatan keuangan harian",
                requirements: "Mahasiswa akuntansi"
            };

            expect(isRelevantInternship(job)).toBe(false);
        });

        it("tidak mensyaratkan kata 'internship/magang' secara eksplisit", () => {
            const job = {
                source: "DevJobsIndo",
                title: "Backend Developer",
                summary: "",
                requirements: ""
            };

            expect(isRelevantInternship(job)).toBe(true);
        });

    });

    describe("Jooble source", () => {

        it("relevan jika title mengandung pola internship DAN ada kata kunci tech", () => {
            const job = {
                source: "Jooble",
                title: "Internship Frontend Developer",
                snippet: "Membangun UI dengan React",
                company: ""
            };

            expect(isRelevantInternship(job)).toBe(true);
        });

        it("tidak relevan jika hanya tech tanpa kata internship/magang di title", () => {
            const job = {
                source: "Jooble",
                title: "Frontend Developer",
                snippet: "Membangun UI dengan React",
                company: ""
            };

            expect(isRelevantInternship(job)).toBe(false);
        });

        it("tidak relevan jika hanya internship tanpa kata kunci tech", () => {
            const job = {
                source: "Jooble",
                title: "Magang Marketing",
                snippet: "Membantu promosi produk",
                company: ""
            };

            expect(isRelevantInternship(job)).toBe(false);
        });

        it("mendukung variasi kata 'magang' (bahasa Indonesia)", () => {
            const job = {
                source: "Jooble",
                title: "Magang Backend Developer",
                snippet: "",
                company: ""
            };

            expect(isRelevantInternship(job)).toBe(true);
        });

        it("tidak relevan jika title dan snippet kosong", () => {
            const job = {
                source: "Jooble",
                title: "",
                snippet: "",
                company: ""
            };

            expect(isRelevantInternship(job)).toBe(false);
        });

    });

});
