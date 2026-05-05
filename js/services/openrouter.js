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
    // Extract model name from response
    const modelName = data.model || model;
    const content = data.choices[0]?.message?.content || 'No response.';
    return { content, model: modelName };
  }

  return { chatCompletion };
})();
