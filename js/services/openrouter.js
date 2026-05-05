window.OpenRouterService = (() => {
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
    return data.choices[0]?.message?.content || 'No response.';
  }

  async function streamChatCompletion({ messages, model, systemPrompt, userContent, onChunk, onModel }) {
    const body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userContent }
      ],
      stream: true
    };

    const response = await fetch('/.netlify/functions/openrouter-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Proxy error ${response.status}: ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let modelName = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') continue;

        try {
          const chunk = JSON.parse(dataStr);
          // First chunk often contains model info
          if (chunk.model && !modelName) {
            modelName = chunk.model;
            if (onModel) onModel(modelName);
          }
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            if (onChunk) onChunk(content);
          }
        } catch (e) {
          console.warn('Failed to parse chunk', dataStr);
        }
      }
    }

    return modelName;
  }

  return { chatCompletion, streamChatCompletion };
})();
