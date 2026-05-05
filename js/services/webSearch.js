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

        // Map to our standard format
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
