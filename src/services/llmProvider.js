/**
 * LLMProvider – Single point to call language models through Netlify edge proxies.
 * Features:
 *   - 20s timeout per call (abort controller)
 *   - Fast‑model override for cheap/simple tasks
 *   - Pass‑through of thinking mode and reasoning effort to backend
 *   - Error handling with user‑friendly messages
 */
export class LLMProvider {
    static endpoint(provider) {
        return provider === 'deepseek'
            ? '/.netlify/functions/deepseek-proxy'
            : '/.netlify/functions/openrouter-proxy';
    }

    static async chatCompletion({
        provider, model, messages, systemPrompt, userContent,
        thinkingMode, reasoningEffort,
        timeoutMs = 45000,
        fastModel = null,
        retries = 2
    }) {
        const body = {
            model: fastModel || model,
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

        let lastError = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const res = await fetch(this.endpoint(provider), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: controller.signal
                });
                clearTimeout(timer);

                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(`LLM error ${res.status}: ${errText}`);
                }
                const data = await res.json();
                return {
                    content: data.choices[0].message.content,
                    model: data.model || model
                };
            } catch (err) {
                clearTimeout(timer);
                lastError = err;
                if (err.name === 'AbortError') {
                    lastError = new Error(`LLM request timed out (${timeoutMs / 1000}s)`);
                }
                if (attempt < retries) {
                    const delay = Math.min(2000 * Math.pow(2, attempt), 10000);
                    console.warn(`LLM call failed (attempt ${attempt + 1}), retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    if (attempt === retries - 1 && !fastModel) {
                        const fastModels = { deepseek: 'deepseek-chat', openrouter: 'openai/gpt-4o-mini' };
                        body.model = fastModels[provider] || model;
                        console.warn('Falling back to faster model:', body.model);
                    }
                }
            }
        }
        throw lastError;
    }

    /**
     * Convenience method for fast, cheap calls (clarification, indexing, review).
     * Uses a cheaper model per provider.
     */
    static async fastCompletion({
        provider, messages, userContent, timeoutMs = 25000
    }) {
        const fastModels = {
            deepseek: 'deepseek-chat',
            openrouter: 'openai/gpt-4o-mini'
        };
        return this.chatCompletion({
            provider,
            model: fastModels[provider] || 'deepseek-chat',
            messages,
            systemPrompt: 'You are a helpful assistant.',
            userContent,
            thinkingMode: false,
            timeoutMs
        });
    }
}
