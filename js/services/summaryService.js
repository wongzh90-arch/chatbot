window.SummaryService = (() => {
  // Estimate token count (rough approximation)
  function estimateTokenCount(text) {
    return Math.ceil(text.length / 4);
  }

  // Core summarisation using LLM
  async function generateSummary(messages, existingSummary = null) {
    // Use the last 6 messages for freshness
    const recentMessages = messages.slice(-6);
    const conversationText = recentMessages
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    const prompt = existingSummary
      ? `Previous summary: ${existingSummary}\n\nNew conversation:\n${conversationText}\n\nUpdate the summary (max 120 words). Preserve task numbers, file paths, and user preferences exactly. Output as 3-5 bullet points.`
      : `Summarise this conversation concisely (max 120 words).\n\n${conversationText}\n\nOutput 3-5 bullet points: Goal, Actions, Pending decisions, Important details.`;

    try {
      const result = await window.LLMProvider.chatCompletion({
        provider: 'deepseek', // could be made configurable
        model: 'deepseek-v4-flash', // cheap and fast
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

  // Decision logic: when to summarise
  async function maybeSummarise(conversationId, messages, triggerEvent = 'auto') {
    const storageKey = `chat_summary_${conversationId}`;
    const lastTurnKey = `${storageKey}_last_turn`;
    const lastTurn = parseInt(localStorage.getItem(lastTurnKey) || '0');
    const newTurns = messages.length - lastTurn;

    // Conditions for summarising:
    // - manual (user requested refresh)
    // - after a command (e.g., /plan, /execute, /commit)
    // - every 5 new messages automatically
    const shouldSummarise =
      triggerEvent === 'manual' ||
      (triggerEvent === 'command' && newTurns >= 1) ||
      (triggerEvent === 'auto' && newTurns >= 5);

    if (!shouldSummarise) return null;

    const existingSummary = localStorage.getItem(storageKey);
    const newSummary = await generateSummary(messages, existingSummary);
    if (newSummary) {
      localStorage.setItem(storageKey, newSummary);
      localStorage.setItem(lastTurnKey, messages.length);
    }
    return newSummary;
  }

  // Retrieve summary for a conversation
  function getSummary(conversationId) {
    return localStorage.getItem(`chat_summary_${conversationId}`);
  }

  // Delete summary when conversation is removed
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
