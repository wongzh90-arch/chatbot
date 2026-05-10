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
        timeoutMs = 20000,
        fastModel = null
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
            if (err.name === 'AbortError') {
                throw new Error('LLM request timed out (20s)');
            }
            throw err;
        }
    }

    /**
     * Convenience method for fast, cheap calls (clarification, indexing, review).
     * Uses a cheaper model per provider.
     */
    static async fastCompletion({
        provider, messages, userContent, timeoutMs = 15000
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
