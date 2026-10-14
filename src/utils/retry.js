/**
 * Jalankan sebuah async function dengan retry + exponential backoff.
 *
 * @param {Function} fn - Async function yang akan dijalankan & diretry.
 * @param {Object} options
 * @param {number} options.retries - Jumlah percobaan ulang (selain percobaan pertama).
 * @param {number} options.baseDelayMs - Delay awal sebelum retry pertama (ms).
 * @param {string} options.label - Label untuk logging.
 * @returns {Promise<any>}
 */
async function withRetry(
    fn,
    {
        retries = 3,
        baseDelayMs = 1000,
        label = "operation"
    } = {}
) {

    let lastError;

    for (let attempt = 1; attempt <= retries + 1; attempt++) {

        try {

            return await fn();

        } catch (error) {

            lastError = error;

            const isLastAttempt = attempt === retries + 1;

            if (isLastAttempt) {
                break;
            }

            const delayMs = baseDelayMs * (2 ** (attempt - 1));

            console.warn(
                `⚠️ ${label} gagal (percobaan ${attempt}/${retries + 1}): ${error.message}. ` +
                `Mencoba lagi dalam ${delayMs}ms...`
            );

            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    throw lastError;
}

module.exports = {
    withRetry
};
