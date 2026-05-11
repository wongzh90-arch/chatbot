/**
 * LLMProvider – Single point to call language models through Netlify edge proxies.
 * Features:
 *   - Streaming support for long responses (bypasses timeout)
 *   - Client-side timeout with abort controller
 *   - Retry with exponential backoff
 *   - Fast-model override for cheap/simple tasks
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
        timeoutMs = 60000, // Increased from 20s to 60s
        fastModel = null,
        stream = false, // Enable streaming for long requests
        onStreamChunk = null
    }) {
        const body = {
            model: fastModel || model,
            stream: stream,
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

            // Handle streaming response
            if (stream && onStreamChunk) {
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let fullContent = '';
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n').filter(line => line.trim());
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices?.[0]?.delta?.content || '';
                                if (content) {
                                    fullContent += content;
                                    onStreamChunk(content, fullContent);
                                }
                            } catch (e) {
                                // Ignore parse errors for [DONE] or malformed chunks
                            }
                        }
                    }
                }
                
                return {
                    content: fullContent,
                    model: model
                };
            }

            const data = await res.json();
            return {
                content: data.choices[0].message.content,
                model: data.model || model
            };
        } catch (err) {
            clearTimeout(timer);
            if (err.name === 'AbortError') {
                throw new Error(`LLM request timed out (${timeoutMs}ms)`);
            }
            throw err;
        }
    }

    /**
     * Retry wrapper with exponential backoff
     */
    static async chatCompletionWithRetry(options, maxRetries = 2) {
        let lastError;
        for (let i = 0; i <= maxRetries; i++) {
            try {
                return await this.chatCompletion({
                    ...options,
                    timeoutMs: options.timeoutMs * (i + 1) // Increase timeout on retry
                });
            } catch (err) {
                lastError = err;
                if (err.message.includes('timed out') && i < maxRetries) {
                    console.warn(`LLM timeout, retrying (${i + 1}/${maxRetries})...`);
                    await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Exponential backoff
                } else {
                    throw err;
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
        provider, messages, userContent, timeoutMs = 20000
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
