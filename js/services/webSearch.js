window.WebSearchService = (() => {
    async function langSearch(query, apiKey, count = 5) {
        if (!apiKey) throw new Error('No LangSearch API key set. Get one free at https://langsearch.com/api-keys');
        const res = await fetch('https://api.langsearch.com/v1/web-search', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query, freshness: 'noLimit', summary: true, count })
        });
        if (!res.ok) throw new Error(`LangSearch HTTP ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return (data.results || []).map(r => ({
            title: r.title || '',
            url: r.url || r.link || '',
            snippet: r.snippet || r.summary || r.content || '',
            source: 'langsearch'
        }));
    }

    async function openRouterWebSearch(query, openRouterKey, model) {
        const tools = [{ type: 'openrouter:web_search', parameters: { max_results: 5 } }];
        const onlineModel = model.endsWith(':online') ? model : model + ':online';
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openRouterKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.href,
                'X-Title': 'Claude Code Web'
            },
            body: JSON.stringify({
                model: onlineModel,
                messages: [
                    { role: 'system', content: 'Search the web for the following query. Return factual results with citations.' },
                    { role: 'user', content: query }
                ],
                tools
            })
        });
        if (!res.ok) throw new Error(`OpenRouter WebSearch HTTP ${res.status}`);
        const data = await res.json();
        const msg = data.choices?.[0]?.message;
        if (!msg) return [];
        if (msg.tool_calls) {
            const results = [];
            for (const tc of msg.tool_calls) {
                if (tc.function) {
                    try {
                        const parsed = JSON.parse(tc.function.arguments);
                        if (parsed.results) results.push(...parsed.results.map(r => ({
                            title: r.title || '',
                            url: r.url || '',
                            snippet: r.snippet || r.content || '',
                            source: 'openrouter'
                        })));
                    } catch { }
                }
            }
            return results;
        }
        return [{
            title: 'OpenRouter Web Results',
            url: '',
            snippet: msg.content || '',
            source: 'openrouter'
        }];
    }

    async function search(query, { langSearchKey, openRouterKey, model, count = 5 } = {}) {
        const results = [];
        if (langSearchKey) {
            try {
                const ls = await langSearch(query, langSearchKey, count);
                results.push(...ls);
            } catch (e) {
                console.warn('LangSearch failed, falling back:', e.message);
            }
        }
        if (results.length === 0 && openRouterKey) {
            try {
                const or = await openRouterWebSearch(query, openRouterKey, model || 'openrouter/auto');
                results.push(...or);
            } catch (e) {
                console.warn('OpenRouter web search failed:', e.message);
            }
        }
        return results;
    }

    function formatForContext(results) {
        if (!results.length) return 'No web results found.';
        return results.map((r, i) =>
            `${i+1}. **${r.title}**  \n   URL: ${r.url}\n   ${r.snippet}`
        ).join('\n\n');
    }

    return { search, langSearch, openRouterWebSearch, formatForContext };
})();
