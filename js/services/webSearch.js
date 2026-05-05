window.WebSearchService = (() => {

  /**
   * Search the web using Firecrawl (via Netlify proxy).
   * @param {string} query
   * @param {object} options - { count: number }
   * @returns {Promise<Array<{title, url, snippet, datePublished, siteName}>>}
   */
  async function search(query, options = {}) {
    const count = options.count || 5;

    try {
      const res = await fetch('/.netlify/functions/firecrawl-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, count }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Firecrawl proxy error ${res.status}: ${errorText}`);
      }

      const results = await res.json();
      return results;
    } catch (e) {
      console.warn('Firecrawl proxy failed:', e.message);
      return [];
    }
  }

  /** Extract domain from a URL */
  function extractDomain(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  /** Format results for rich UI rendering */
  function formatForContext(results) {
    if (!results || results.length === 0) return 'No web results found.';
    return results
      .map((r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`)
      .join('\n\n');
  }

  /** Format results for AI context (used by synthesis) */
  function formatForAI(results) {
    if (!results || results.length === 0) return 'No web results found.';
    return results
      .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
      .join('\n\n---\n\n');
  }

  return { search, formatForContext, formatForAI, extractDomain };
})();
