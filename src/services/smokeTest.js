// SmokeTest: poll a Netlify deploy-preview URL until the page renders correctly.
export class SmokeTest {
    /**
     * Poll a URL until it returns a healthy page or times out.
     */
    static async waitForPreview(url, timeoutMs = 180000, intervalMs = 15000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                const res = await fetch(url, { cache: 'no-cache' });
                if (res.ok) {
                    const text = await res.text();
                    if (text.includes('id="root"') && !text.includes('SyntaxError')) {
                        return { success: true, url };
                    }
                }
            } catch (e) { /* network hiccup — keep retrying */ }
            await new Promise(r => setTimeout(r, intervalMs));
        }
        return { success: false, error: 'Preview not healthy within timeout' };
    }

    /**
     * Build the deploy-preview URL for a given PR and site name.
     * @param {number} prNumber
     * @param {string} siteName - Netlify site name, e.g. "cc-copy"
     */
    static getPreviewUrl(prNumber, siteName) {
        if (!siteName) throw new Error('siteName is required');
        return `https://deploy-preview-${prNumber}--${siteName}.netlify.app`;
    }

    /**
     * Full smoke test for a deploy preview.
     * @param {string} repo
     * @param {string} branch
     * @param {string} githubToken
     * @param {number} prNumber
     * @param {string} siteName - Netlify site name (e.g. "cc-copy")
     */
    static async testDeployPreview(repo, branch, githubToken, prNumber, siteName) {
        const previewUrl = this.getPreviewUrl(prNumber, siteName);
        return this.waitForPreview(previewUrl);
    }
}
