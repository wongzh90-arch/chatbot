window.OpenRouterService = (() => {
  async function chatCompletion({ messages, model, systemPrompt, userContent }) {
    const body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userContent }
      ]
    };

    // Call the Netlify function (consider using a relative path)
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

  // Keep the `chatCompletionWithTools` if needed, but you must proxy tool‑enabled models the same way.
  // For simplicity, keep only what you actually use.

  return { chatCompletion };
})();
