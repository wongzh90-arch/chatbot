// inside js/services/llmProvider.js
async function chatCompletionStream({
  provider, model, messages, systemPrompt, userContent,
  thinkingMode, reasoningEffort,
  onToken, onDone, onError
}) {
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
    stream: true,
  };

  if (provider === 'deepseek' && thinkingMode) {
    body.thinking = { type: 'enabled' };
    body.reasoning_effort = reasoningEffort || 'high';
  }

  try {
    const response = await fetch(endpoint, {
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
    let modelName = model;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullContent += delta;
              if (onToken) onToken(delta, fullContent);
            }
            if (parsed.model) modelName = parsed.model;
            // handle reasoning_content if present (DeepSeek)
            const reasoning = parsed.choices?.[0]?.delta?.reasoning_content;
            if (reasoning && onReasoning) { /* optional */ }
          } catch (e) {
            // ignore parse errors for incomplete chunks
          }
        }
      }
    }

    if (onDone) onDone(fullContent, modelName, null);
  } catch (e) {
    if (onError) onError(e);
  }
}
