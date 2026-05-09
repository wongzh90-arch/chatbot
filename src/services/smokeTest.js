// SmokeTest: poll a Netlify preview URL until page renders
export class SmokeTest {
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
            } catch (e) {}
            await new Promise(r => setTimeout(r, intervalMs));
        }
        return { success: false, error: 'Preview not healthy' };
    }

    static getPreviewUrl(prNumber) {
        const siteName = localStorage.getItem('NETLIFY_SITE_NAME');
        if (!siteName) throw new Error('NETLIFY_SITE_NAME not set');
        return `https://deploy-preview-${prNumber}--${siteName}.netlify.app`;
    }

    static async testDeployPreview(repo, branch, githubToken, prNumber) {
        const previewUrl = this.getPreviewUrl(prNumber);
        return this.waitForPreview(previewUrl);
    }
}
