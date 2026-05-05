window.LLMProvider = (() => {
  // ---------- non‑streaming ----------
  async function chatCompletion({ provider, model, messages, systemPrompt, userContent, thinkingMode, reasoningEffort }) {
    const endpoint = provider === 'deepseek'
      ? '/.netlify/functions/deepseek-proxy'
      : '/.netlify/functions/openrouter-proxy';

    const body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userContent }
      ],
      stream: false,
    };

    // DeepSeek thinking mode
    if (provider === 'deepseek' && thinkingMode) {
      body.thinking = { type: 'enabled' };
      body.reasoning_effort = reasoningEffort || 'high';
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Proxy error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0]?.message || {};
    return {
      content: choice.content || '',
      reasoning_content: choice.reasoning_content || null,
      model: data.model || model,
    };
  }

  // ---------- streaming simulation ----------
  async function chatCompletionStream({
    provider, model, messages, systemPrompt, userContent,
    thinkingMode, reasoningEffort,
    onToken, onDone, onError
  }) {
    try {
      const endpoint = provider === 'deepseek'
        ? '/.netlify/functions/deepseek-proxy'
        : '/.netlify/functions/openrouter-proxy';

      const body = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: userContent }
        ],
        stream: false, // Netlify can't stream, we simulate on client
      };

      if (provider === 'deepseek' && thinkingMode) {
        body.thinking = { type: 'enabled' };
        body.reasoning_effort = reasoningEffort || 'high';
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Proxy error ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const message = data.choices?.[0]?.message || {};
      const fullContent = message.content || '';
      const reasoning = message.reasoning_content || null;
      const modelName = data.model || model;

      // Simulate streaming token-by-token with variable delay
      let i = 0;
      const words = fullContent.split(/(\s+)/);
      const streamWords = async () => {
        for (const word of words) {
          if (onToken) onToken(word, fullContent.substring(0, i + word.length));
          i += word.length;
          const delay = word.trim().length === 0 ? 5 : Math.min(word.length * 8, 40);
          await new Promise(r => setTimeout(r, delay));
        }
        if (onDone) onDone(fullContent, modelName, reasoning);
      };

      streamWords();
      return { cancel: () => { i = fullContent.length; } };
    } catch (e) {
      if (onError) onError(e);
    }
  }

  return { chatCompletion, chatCompletionStream };
})();
