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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    if (wantsStream) {
      requestBody.stream = true;
      let response;
      try {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': event.headers.origin || 'https://your-site.netlify.app',
            'X-Title': 'Claude Code Web',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

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
    let response;
    try {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': event.headers.origin || 'https://your-site.netlify.app',
          'X-Title': 'Claude Code Web',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json();
    return {
      statusCode: response.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };

  } catch (error) {
    const isTimeout = error.name === 'AbortError';
    console.error(isTimeout ? 'OpenRouter timeout' : 'OpenRouter proxy error:', error);
    return {
      statusCode: isTimeout ? 504 : 500,
      body: JSON.stringify({ error: isTimeout ? 'OpenRouter API timed out after 25s' : error.message }),
    };
  }
};
