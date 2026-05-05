window.WebSearchService = (() => {

  async function langSearch(query, count = 5) {
    try {
      const res = await fetch('/.netlify/functions/langsearch-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, freshness: 'noLimit', summary: true, count })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`LangSearch proxy error ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const rawResults = data?.data?.webPages?.value || [];

      return rawResults.map(r => ({
        title: r.name || r.title || '',
        url: r.url || r.link || '',
        snippet: r.snippet || r.summary || r.content || '',
        datePublished: r.datePublished || r.date || null,
        siteName: r.siteName || extractDomain(r.url || r.link || ''),
        source: 'langsearch'
      }));
    } catch (e) {
      console.warn('LangSearch proxy failed:', e.message);
      return [];
    }
  }

  function extractDomain(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  async function search(query, options = {}) {
    const { count = 5 } = options;
    return await langSearch(query, count);
  }

  // Returns structured data for rich UI rendering
  function formatForContext(results) {
    if (!results || results.length === 0) return 'No web results found.';
    return results
      .map((r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`)
      .join('\n\n');
  }

  // Returns JSON string for AI context
  function formatForAI(results) {
    if (!results || results.length === 0) return 'No web results found.';
    return results
      .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
      .join('\n\n---\n\n');
  }

  return { search, langSearch, formatForContext, formatForAI, extractDomain };
})();
