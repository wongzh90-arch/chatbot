window.OpenRouterService = (() => {
    async function chatCompletion({ messages, model, apiKey, systemPrompt, userContent }) {
        const body = {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
                { role: 'user', content: userContent }
            ]
        };
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.href,
                'X-Title': 'Claude Code Web'
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return data.choices[0]?.message?.content || 'No response.';
    }

    async function chatCompletionWithTools({ messages, model, apiKey, systemPrompt, userContent, tools, tool_choice }) {
        const body = {
            model: model.endsWith(':online') ? model : model,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
                { role: 'user', content: userContent }
            ],
            tools
        };
        if (tool_choice) body.tool_choice = tool_choice;

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.href,
                'X-Title': 'Claude Code Web'
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        return await res.json();
    }

    return { chatCompletion, chatCompletionWithTools };
})();
