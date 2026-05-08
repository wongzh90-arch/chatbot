window.DocSearch = (() => {
  // Default documentation sources – you can add more
  const DEFAULT_SOURCES = [
    { domain: 'react.dev', name: 'React' },
    { domain: 'tailwindcss.com', name: 'Tailwind CSS' },
    { domain: 'docs.github.com', name: 'GitHub API' },
    { domain: 'developer.mozilla.org', name: 'MDN' }
  ];

  /**
   * Search documentation for a query using Firecrawl (via WebSearchService)
   * @param {string} query – e.g. "how to add a new React component"
   * @param {Array} sources – optional array of { domain, name }
   * @returns {Promise<string>} – concise summary of relevant findings
   */
  async function searchDocs(query, sources = DEFAULT_SOURCES) {
    // Build site-specific queries
    const siteQueries = sources.map(src => `${query} site:${src.domain}`);
    const allResults = [];
    for (const sq of siteQueries) {
      try {
        const results = await window.WebSearchService.search(sq, { count: 2 });
        allResults.push(...results);
      } catch (e) {
        console.warn(`DocSearch failed for ${sq}:`, e);
      }
    }
    if (allResults.length === 0) return null;

    // Format for LLM context (simple text)
    const context = allResults.map((r, i) =>
      `[${i+1}] ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}`
    ).join('\n\n---\n\n');

    // Use LLM to distill into a short summary (100-150 words)
    try {
      const summary = await window.LLMProvider.chatCompletion({
        provider: window.useProviderState?.().provider || 'deepseek',
        model: window.useProviderState?.().selectedModel || 'deepseek-v4-flash',
        messages: [],
        systemPrompt: 'You are a technical research assistant. Given search results about the user\'s goal, write a concise 2-3 sentence summary of the most relevant information that would help plan the task.',
        userContent: `Goal: ${query}\n\nSearch results:\n${context}`,
        thinkingMode: false
      });
      return summary.content;
    } catch {
      return context.slice(0, 2000); // fallback
    }
  }

  return { searchDocs };
})();
