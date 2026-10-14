// Definisi kategori dipisah agar bisa dipakai untuk:
// 1. Deteksi kategori sebuah lowongan (getJobCategory)
// 2. Pilihan filter di slash command /cari (JOB_CATEGORIES)

const JOB_CATEGORIES = [
    {
        name: "Frontend / Web",
        emoji: "🌐",
        keywords: [
            "frontend", "front-end", "react", "web developer",
            "web development", "vue", "angular", "next.js", "html", "css"
        ]
    },
    {
        name: "Backend",
        emoji: "⚙️",
        keywords: [
            "backend", "back-end", "node.js", "nodejs", "java",
            "golang", "php", "laravel", "spring", ".net", "api"
        ]
    },
    {
        name: "Mobile",
        emoji: "📱",
        keywords: [
            "mobile", "android", "ios", "flutter", "react native"
        ]
    },
    {
        name: "Data / AI",
        emoji: "📊",
        keywords: [
            "data analyst", "data analysis", "data science", "data engineer",
            "machine learning", "artificial intelligence", "ai", "big data"
        ]
    },
    {
        name: "Cyber Security",
        emoji: "🔐",
        keywords: [
            "cyber", "security", "information security", "it security",
            "penetration testing", "pentest"
        ]
    },
    {
        name: "UI/UX Design",
        emoji: "🎨",
        keywords: [
            "ui/ux", "ui ux", "user interface", "user experience",
            "ux designer", "ui designer", "product designer", "figma"
        ]
    },
    {
        name: "DevOps / Cloud",
        emoji: "☁️",
        keywords: [
            "devops", "cloud", "aws", "azure", "google cloud",
            "infrastructure", "kubernetes", "docker"
        ]
    },
    {
        name: "IT Support",
        emoji: "💻",
        keywords: [
            "it support", "helpdesk", "technical support",
            "system administrator", "it asset", "it operations"
        ]
    },
    {
        name: "QA / Testing",
        emoji: "🧪",
        keywords: [
            "quality assurance", "qa", "software testing", "tester"
        ]
    },
    {
        name: "Product / PM",
        emoji: "📋",
        keywords: [
            "product manager", "product owner", "project manager",
            "product design", "scrum"
        ]
    }
];

function getJobCategory(job) {
    const text = `
        ${job.title || ""}
        ${job.snippet || ""}
    `.toLowerCase();

    for (const category of JOB_CATEGORIES) {

        const matched = category.keywords.some(
            keyword => text.includes(keyword)
        );

        if (matched) {
            return `${category.emoji} ${category.name}`;
        }
    }

    return "💻 Information Technology";
}

module.exports = {
    JOB_CATEGORIES,
    getJobCategory
};
