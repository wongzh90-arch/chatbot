window.SmokeTest = (() => {
  // Poll a URL until it returns a successful response with the root element
  async function waitForPreview(url, timeoutMs = 180000, intervalMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const response = await fetch(url, { method: 'GET', cache: 'no-cache' });
        if (response.ok) {
          const text = await response.text();
          // Check for the React root div and absence of critical JS errors
          if (text.includes('id="root"') && !text.includes('SyntaxError')) {
            return { success: true, url };
          }
        }
      } catch (e) {
        // Still building or unreachable – wait and retry
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    return { success: false, error: `Preview not healthy after ${timeoutMs / 1000}s` };
  }

  // Build preview URL from Netlify site name (must be set in localStorage)
  function getPreviewUrl(prNumber) {
    const siteName = localStorage.getItem('NETLIFY_SITE_NAME');
    if (!siteName) throw new Error('NETLIFY_SITE_NAME not set. Go to Netlify → Site Settings → Site name, then run: localStorage.setItem("NETLIFY_SITE_NAME", "your-site-name")');
    return `https://deploy-preview-${prNumber}--${siteName}.netlify.app`;
  }

  async function testDeployPreview(repo, branch, githubToken, prNumber) {
    const previewUrl = getPreviewUrl(prNumber);
    return await waitForPreview(previewUrl);
  }

  // Manual test for existing PR (for /smoke-test command)
  async function testExistingPR(prNumber) {
    const previewUrl = getPreviewUrl(prNumber);
    return await waitForPreview(previewUrl);
  }

  return { waitForPreview, testDeployPreview, testExistingPR, getPreviewUrl };
})();
