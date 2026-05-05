// js/services/webSearch.js
window.WebSearchService = (() => {

    /**
     * Searches the web using LangSearch (proxied through a Netlify function).
     * No API key is needed in the client – it's stored in Netlify environment variables.
     *
     * @param {string} query - The search query.
     * @param {number} count - Max results (default 5).
     * @returns {Promise<Array>} Array of result objects { title, url, snippet, source }.
     */
    async function langSearch(query, count = 5) {
        try {
            const res = await fetch('/.netlify/functions/langsearch-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query,
                    freshness: 'noLimit',
                    summary: true,
                    count
                })
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`LangSearch proxy error ${res.status}: ${errorText}`);
            }

            const data = await res.json();

            // Standardise the result format regardless of the API response structure.
            return (data.results || []).map(r => ({
                title: r.title || '',
                url: r.url || r.link || '',
                snippet: r.snippet || r.summary || r.content || '',
                source: 'langsearch'
            }));
        } catch (e) {
            console.warn('LangSearch proxy failed:', e.message);
            return [];
        }
    }

    /**
     * Main search entry point.
     * Only uses LangSearch (via proxy). Falls back to an empty array if it fails.
     *
     * @param {string} query - The search query.
     * @param {object} options - Optional config (no API keys required anymore).
     * @param {string} options.langSearchKey - Ignored (kept for backward compatibility).
     * @param {number} options.count - Number of results.
     * @returns {Promise<Array>} Array of search results.
     */
    async function search(query, options = {}) {
        const { count = 5 } = options;

        // LangSearch is now the only provider (via Netlify function).
        // If you ever want to add more providers, do it here.
        const results = await langSearch(query, count);
        return results;
    }

    /**
     * Formats search results into a markdown string suitable for AI prompt context.
     *
     * @param {Array} results - The array of result objects.
     * @returns {string} Formatted string for the AI.
     */
    function formatForContext(results) {
        if (!results || results.length === 0) {
            return 'No web results found.';
        }

        return results
            .map((r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`)
            .join('\n\n');
    }

    // Expose public methods
    return {
        search,
        langSearch,          // exposed if you need to call it directly
        formatForContext
    };
})();
