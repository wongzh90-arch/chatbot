export class LLMProvider {
    static endpoint(provider) {
        return provider === 'deepseek'
            ? '/.netlify/functions/deepseek-proxy'
            : '/.netlify/functions/openrouter-proxy';
    }

    static async chatCompletion({ provider, model, messages, systemPrompt, userContent, thinkingMode, reasoningEffort }) {
        const body = {
            model,
            stream: false,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages.map(m => ({ role: m.role, content: m.content })),
                { role: 'user', content: userContent }
            ]
        };
        if (provider === 'deepseek' && thinkingMode) {
            body.thinking = { type: 'enabled' };
            body.reasoning_effort = reasoningEffort || 'high';
        }
        const res = await fetch(this.endpoint(provider), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return { content: data.choices[0].message.content, model: data.model || model };
    }
}
