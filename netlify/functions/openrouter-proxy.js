exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const API_KEY = process.env.OPENROUTER_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, body: 'Server misconfigured: missing API key' };
  }

  try {
    const requestBody = JSON.parse(event.body);
    const wantsStream = requestBody.stream === true;

    if (wantsStream) {
      // Netlify Functions don't support true SSE, so we collect the stream
      // and return chunked content. For real streaming, use Edge Functions.
      // We'll return the full response but the client can simulate streaming.
      requestBody.stream = true;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': event.headers.origin || 'https://your-site.netlify.app',
          'X-Title': 'Claude Code Web',
        },
        body: JSON.stringify(requestBody),
      });

      // Collect all SSE chunks
      const text = await response.text();
      const lines = text.split('\n');
      let fullContent = '';
      let modelName = requestBody.model || '';

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const chunk = JSON.parse(line.slice(6));
            const delta = chunk.choices?.[0]?.delta?.content || '';
            fullContent += delta;
            if (chunk.model) modelName = chunk.model;
          } catch {}
        }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          choices: [{ message: { content: fullContent } }],
          model: modelName,
        }),
      };
    }

    // Non-streaming path
    requestBody.stream = false;
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': event.headers.origin || 'https://your-site.netlify.app',
        'X-Title': 'Claude Code Web',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    return {
      statusCode: response.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
