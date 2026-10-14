function getJobCategory(job) {
    const text = `
        ${job.title || ""}
        ${job.snippet || ""}
    `.toLowerCase();

    if (
        text.includes("frontend") ||
        text.includes("front-end") ||
        text.includes("react") ||
        text.includes("web developer")
    ) {
        return "🌐 Frontend / Web Development";
    }

    if (
        text.includes("backend") ||
        text.includes("back-end") ||
        text.includes("node.js") ||
        text.includes("java")
    ) {
        return "⚙️ Backend Development";
    }

    if (
    text.includes("it asset") ||
    text.includes("it support") ||
    text.includes("helpdesk") ||
    text.includes("technical support") ||
    text.includes("system administrator") ||
    text.includes("infrastructure")
    ) {
        return "💻 IT / Infrastructure";
    }

    if (
        text.includes("data") ||
        text.includes("machine learning") ||
        text.includes("artificial intelligence")
    ) {
        return "📊 Data / AI";
    }

    if (
        text.includes("cyber") ||
        text.includes("security")
    ) {
        return "🔐 Cyber Security";
    }

    if (
        text.includes("ui/ux") ||
        text.includes("ui ux") ||
        text.includes("user interface")
    ) {
        return "🎨 UI/UX Design";
    }

    if (
        text.includes("devops") ||
        text.includes("cloud")
    ) {
        return "☁️ DevOps / Cloud";
    }

    if (
        text.includes("mobile") ||
        text.includes("android") ||
        text.includes("ios")
    ) {
        return "📱 Mobile Development";
    }

    return "💻 Information Technology";
}

module.exports = {
    getJobCategory
};