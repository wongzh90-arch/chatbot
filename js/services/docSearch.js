// js/services/docSearch.js
window.DocSearch = (() => {
  // Default documentation sources (unused but kept for compatibility)
  const DEFAULT_SOURCES = [
    { domain: 'react.dev', name: 'React' },
    { domain: 'tailwindcss.com', name: 'Tailwind CSS' },
    { domain: 'docs.github.com', name: 'GitHub API' },
    { domain: 'developer.mozilla.org', name: 'MDN' }
  ];

  // Direct call to Firecrawl scrape (Netlify Edge Function)
  async function scrapePage(pageUrl) {
    try {
      const res = await fetch('/.netlify/functions/firecrawl-proxy/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pageUrl }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Scrape failed: ${res.status} ${err}`);
      }
      const data = await res.json();
      return data.content || '';
    } catch (e) {
      console.warn('Scrape error:', e);
      return null;
    }
  }

  // Get current provider/model from localStorage (safe, no React hooks)
  function getModelConfig() {
    const provider = localStorage.getItem('PROVIDER') || 'deepseek';
    let model;
    if (provider === 'deepseek') {
      model = localStorage.getItem('OR_MODEL') || 'deepseek-v4-flash';
    } else {
      model = localStorage.getItem('OR_MODEL') || 'openrouter/auto';
    }
    return { provider, model };
  }

  /**
   * Smart search: returns search results, optionally scrapes top result,
   * then returns a concise summary.
   * @param {string} query - User's question / goal
   * @param {object} options - { alwaysScrape: bool, maxScrapedPages: number }
   * @returns {Promise<{ summary: string, scrapedContent: Array, searchResults: Array }>}
   */
  async function smartSearch(query, options = {}) {
    const { alwaysScrape = false, maxScrapedPages = 1 } = options;

    // Step 1: Get search results (snippets) via WebSearchService (Firecrawl search)
    let searchResults = [];
    try {
      searchResults = await window.WebSearchService.search(query, { count: 3 });
    } catch (e) {
      console.warn('WebSearchService failed', e);
      searchResults = [];
    }

    // Step 2: Optionally scrape the top result(s)
    let scrapedContent = [];
    if (alwaysScrape && searchResults.length > 0) {
      for (let i = 0; i < Math.min(maxScrapedPages, searchResults.length); i++) {
        const url = searchResults[i].url;
        const content = await scrapePage(url);
        if (content) {
          scrapedContent.push({ url, content: content.slice(0, 3000) }); // limit per page
        }
      }
    }

    // Step 3: Build context for LLM summary
    const snippetsBlock = searchResults.map((r, i) =>
      `${i+1}. **${r.title}**\n   URL: ${r.url}\n   Snippet: ${r.snippet}`
    ).join('\n\n');

    const scrapedBlock = scrapedContent.length
      ? `\n\n**Full content from ${scrapedContent[0].url}:**\n${scrapedContent[0].content}`
      : '';

    let summary = '';
    try {
      const { provider, model } = getModelConfig();
      const llmReply = await window.LLMProvider.chatCompletion({
        provider,
        model,
        messages: [],
        systemPrompt: 'You are a research assistant. Summarise the key information relevant to the user\'s query. Be concise (max 200 words). Use bullet points if helpful. Include citations as [Source Name](url) when available.',
        userContent: `Query: ${query}\n\nSearch results:\n${snippetsBlock}${scrapedBlock}`,
        thinkingMode: false,
      });
      summary = llmReply.content;
    } catch (err) {
      console.warn('LLM summary failed', err);
      summary = `Found ${searchResults.length} results. ${scrapedContent.length ? 'Read one page.' : ''}`;
    }

    return { summary, scrapedContent, searchResults };
  }

  // For backward compatibility with older calls (e.g., in /plan clarification)
  async function searchDocs(query, sources = DEFAULT_SOURCES) {
    // This version returns just a simple summary (no scraping)
    const result = await smartSearch(query, { alwaysScrape: false });
    return result.summary;
  }

  return { searchDocs, smartSearch, scrapePage };
})();
