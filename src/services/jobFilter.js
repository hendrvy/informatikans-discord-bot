const internshipPatterns = [
    /\bintern\b/i,
    /\binternship\b/i,
    /\bmagang\b/i,
    /\btrainee\b/i,
    /\btraineeship\b/i,
    /\bapprentice\b/i
];

const techKeywords = [
    // Software
    "software",
    "developer",
    "development",
    "programmer",
    "programming",
    "engineer",
    "engineering",

    // Web
    "frontend",
    "front-end",
    "backend",
    "back-end",
    "fullstack",
    "full stack",
    "web developer",
    "web development",

    // Mobile
    "mobile developer",
    "mobile development",
    "android",
    "ios",

    // Data
    "data analyst",
    "data analysis",
    "data science",
    "data engineer",
    "data engineering",
    "machine learning",
    "artificial intelligence",
    "artificial intelligence",

    // Security
    "cyber security",
    "cybersecurity",
    "information security",
    "it security",
    "security engineer",

    // Infrastructure
    "devops",
    "cloud",
    "cloud computing",
    "network",
    "networking",
    "infrastructure",
    "system engineer",
    "systems engineer",
    "system administrator",
    "systems administrator",

    // IT
    "information technology",
    "information systems",
    "computer science",
    "computer engineering",
    "it support",
    "it operations",
    "it asset",
    "it infrastructure",
    "it helpdesk",
    "helpdesk",

    // Database
    "database",
    "sql",
    "mysql",
    "postgresql",
    "mongodb",

    // UI/UX
    "ui/ux",
    "ui ux",
    "user interface",
    "user experience",
    "ux designer",
    "ui designer",

    // QA
    "quality assurance",
    "qa engineer",
    "software testing",
    "tester",

    // Technical
    "technical",
    "technology",
    "technical support",
    "technical project",

    // IoT / Hardware
    "iot",
    "internet of things",
    "embedded",
    "embedded system",
    "embedded systems",
    "robotics",
    "prototyping",

    // Specific
    "early warning system"
];

function isRelevantInternship(job) {

    const title =
        `${job.title || ""}`.toLowerCase();

    const text = `
        ${job.title || ""}
        ${job.position || ""}
        ${job.snippet || ""}
        ${job.summary || ""}
        ${job.requirements || ""}
        ${job.company || ""}
    `.toLowerCase();

    // =====================================
    // DEVJOBSINDO
    // =====================================

    if (
        job.source === "DevJobsIndo"
    ) {

        const isTech =
            techKeywords.some(
                keyword =>
                    text.includes(
                        keyword
                    )
            );

        console.log(
            `🔎 Filter DevJobsIndo: ${job.title} => ${
                isTech
                    ? "TECH"
                    : "NON-TECH"
            }`
        );

        return isTech;
    }

    // =====================================
    // KALIBRR
    // =====================================
    // Halaman hasil sudah difilter te=Internship, jadi cukup
    // saring yang berhubungan dengan IT.

    if (
        job.source === "Kalibrr"
    ) {

        const isTech =
            techKeywords.some(
                keyword =>
                    text.includes(
                        keyword
                    )
            );

        console.log(
            `🔎 Filter Kalibrr: ${job.title} => ${
                isTech
                    ? "TECH"
                    : "NON-TECH"
            }`
        );

        return isTech;
    }

    // =====================================
    // JOOBLE
    // =====================================

    const isInternship =
        internshipPatterns.some(
            pattern =>
                pattern.test(title)
        );

    const isTech =
        techKeywords.some(
            keyword =>
                text.includes(
                    keyword
                )
        );

    return (
        isInternship &&
        isTech
    );
}

module.exports = {
    isRelevantInternship
};