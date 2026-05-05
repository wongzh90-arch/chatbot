// js/services/webSearch.js
window.WebSearchService = (() => {

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

            // LangSearch nests results inside data.webPages.value
            const rawResults = data?.data?.webPages?.value || [];

            return rawResults.map(r => ({
                title: r.name || r.title || '',
                url: r.url || r.link || '',
                snippet: r.snippet || r.summary || r.content || '',
                source: 'langsearch'
            }));
        } catch (e) {
            console.warn('LangSearch proxy failed:', e.message);
            return [];
        }
    }

    async function search(query, options = {}) {
        const { count = 5 } = options;
        const results = await langSearch(query, count);
        return results;
    }

    function formatForContext(results) {
        if (!results || results.length === 0) {
            return 'No web results found.';
        }
        return results
            .map((r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`)
            .join('\n\n');
    }

    return { search, langSearch, formatForContext };
})();
