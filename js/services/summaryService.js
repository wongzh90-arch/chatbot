window.SummaryService = (() => {
    function estimateTokenCount(text) {
        return Math.ceil(text.length / 4);
    }

    async function generateSummary(messages, existingSummary = null) {
        if (!messages || messages.length === 0) return null;

        const recentMessages = messages.slice(-6);
        const conversationText = recentMessages
            .map(m => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
            .join('\n');

        const prompt = existingSummary
            ? `Previous summary: ${existingSummary}\n\nNew conversation:\n${conversationText}\n\nUpdate the summary (max 120 words). Preserve task numbers, file paths, and user preferences exactly. Output as 3-5 bullet points.`
            : `Summarise this conversation concisely (max 120 words).\n\n${conversationText}\n\nOutput 3-5 bullet points: Goal, Actions, Pending decisions, Important details.`;

        // Read current provider and model from localStorage instead of hardcoding
        const currentProvider = localStorage.getItem('PROVIDER') || 'deepseek';
        const currentModel = localStorage.getItem('OR_MODEL') || 'deepseek-chat';

        try {
            const result = await window.LLMProvider.chatCompletion({
                provider: currentProvider,
                model: currentModel,
                messages: [],
                systemPrompt: 'You are a concise conversation summariser. Output only the summary, no extra text.',
                userContent: prompt,
                thinkingMode: false,
            });
            return result.content;
        } catch (e) {
            console.error('Summary generation failed:', e);
            return null;
        }
    }

    async function maybeSummarise(conversationId, messages, triggerEvent = 'auto') {
        if (!conversationId || !messages || messages.length === 0) return null;

        const storageKey = `chat_summary_${conversationId}`;
        const lastTurnKey = `${storageKey}_last_turn`;
        const lastTurn = parseInt(localStorage.getItem(lastTurnKey) || '0');
        const newTurns = messages.length - lastTurn;

        const shouldSummarise =
            triggerEvent === 'manual' ||
            triggerEvent === 'command' ||
            (triggerEvent === 'auto' && newTurns >= 1);

        if (!shouldSummarise) return null;

        const existingSummary = localStorage.getItem(storageKey);
        const newSummary = await generateSummary(messages, existingSummary);
        if (newSummary) {
            localStorage.setItem(storageKey, newSummary);
            localStorage.setItem(lastTurnKey, messages.length);
            window.dispatchEvent(new CustomEvent('summary-updated', {
                detail: { conversationId, summary: newSummary }
            }));
        }
        return newSummary;
    }

    function getSummary(conversationId) {
        return localStorage.getItem(`chat_summary_${conversationId}`);
    }

    function deleteSummary(conversationId) {
        localStorage.removeItem(`chat_summary_${conversationId}`);
        localStorage.removeItem(`chat_summary_${conversationId}_last_turn`);
    }

    return {
        generateSummary,
        maybeSummarise,
        getSummary,
        deleteSummary,
        estimateTokenCount,
    };
})();
