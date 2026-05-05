window.OpenRouterService = (() => {

  // Simulates streaming by progressively revealing text
  async function chatCompletionStream({
    messages, model, systemPrompt, userContent,
    onToken, onDone, onError
  }) {
    try {
      const body = {
        model,
        stream: false, // Netlify functions can't true-stream; we simulate client-side
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: userContent }
        ],
      };

      const res = await fetch('/.netlify/functions/openrouter-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Proxy error ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const modelName = data.model || model;
      const fullContent = data.choices[0]?.message?.content || 'No response.';

      // Simulate streaming token by token with variable speed
      let i = 0;
      const words = fullContent.split(/(\s+)/);

      const streamWords = async () => {
        for (const word of words) {
          if (onToken) onToken(word, fullContent.substring(0, i + word.length));
          i += word.length;
          // Variable delay: faster for spaces, slower for longer words
          const delay = word.trim().length === 0 ? 5 : Math.min(word.length * 8, 40);
          await new Promise(r => setTimeout(r, delay));
        }
        if (onDone) onDone(fullContent, modelName);
      };

      streamWords();
      return { cancel: () => { i = fullContent.length; } };
    } catch (e) {
      if (onError) onError(e);
    }
  }

  async function chatCompletion({ messages, model, systemPrompt, userContent }) {
    const body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userContent }
      ],
      stream: false
    };

    const res = await fetch('/.netlify/functions/openrouter-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Proxy error ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    const modelName = data.model || model;
    const content = data.choices[0]?.message?.content || 'No response.';
    return { content, model: modelName };
  }

  return { chatCompletion, chatCompletionStream };
})();
