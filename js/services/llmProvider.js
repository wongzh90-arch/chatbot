// js/services/llmProvider.js
// Both chatCompletion and chatCompletionStream use the streaming endpoint.
// This avoids Netlify's 10-second sync function timeout — the first SSE chunk
// arrives in ~1s, keeping the connection alive for the full response.

window.LLMProvider = (() => {

  function buildBody(provider, model, messages, systemPrompt, userContent, thinkingMode, reasoningEffort, stream) {
    const body = {
      model,
      stream,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
          .filter(m => m.role !== 'system')
          .map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userContent },
      ],
    };
    if (provider === 'deepseek' && thinkingMode) {
      body.thinking = { type: 'enabled' };
      body.reasoning_effort = reasoningEffort || 'high';
    }
    return body;
  }

  function endpoint(provider) {
    return provider === 'deepseek'
      ? '/.netlify/functions/deepseek-proxy'
      : '/.netlify/functions/openrouter-proxy';
  }

  // ---------- streaming (primary) ----------
  async function chatCompletionStream({
    provider, model, messages, systemPrompt, userContent,
    thinkingMode, reasoningEffort,
    onToken, onDone, onError,
  }) {
    const body = buildBody(provider, model, messages, systemPrompt, userContent, thinkingMode, reasoningEffort, true);

    try {
      const response = await fetch(endpoint(provider), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Proxy error ${response.status}: ${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let fullReasoning = '';
      let modelName = model;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta || {};

            if (delta.content) {
              fullContent += delta.content;
              if (onToken) onToken(delta.content, fullContent);
            }
            if (delta.reasoning_content) {
              fullReasoning += delta.reasoning_content;
            }
            if (parsed.model) modelName = parsed.model;
          } catch {
            // partial chunk — ignore
          }
        }
      }

      if (onDone) onDone(fullContent, modelName, fullReasoning || null);

    } catch (e) {
      if (onError) onError(e);
      else throw e;
    }
  }

  // ---------- non-streaming shim ----------
  // Internally uses streaming so the proxy never hits the 10s Netlify timeout.
  // Callers (planner, executor, reviewer) get the same { content, model } shape.
  function chatCompletion(opts) {
    return new Promise((resolve, reject) => {
      chatCompletionStream({
        ...opts,
        onToken: null, // suppress token callbacks — callers don't need them
        onDone: (content, model, reasoning) => resolve({
          content,
          reasoning_content: reasoning,
          model,
        }),
        onError: reject,
      });
    });
  }

  return { chatCompletion, chatCompletionStream };
})();
