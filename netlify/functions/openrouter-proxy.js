// netlify/functions/openrouter-proxy.js
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const API_KEY = process.env.OPENROUTER_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, body: 'Server misconfigured: missing OPENROUTER_API_KEY' };
  }

  try {
    const requestBody = JSON.parse(event.body);
    requestBody.stream = true; // Force streaming

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 29000);

    const upstreamRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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

    clearTimeout(timeout);

    if (!upstreamRes.ok) {
      const errorText = await upstreamRes.text();
      return {
        statusCode: upstreamRes.status,
        body: JSON.stringify({ error: errorText }),
      };
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    (async () => {
      try {
        const reader = upstreamRes.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);
        }
      } catch (err) {
        console.error('OpenRouter streaming error:', err);
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    const isTimeout = error.name === 'AbortError';
    console.error(isTimeout ? 'OpenRouter timeout' : 'OpenRouter proxy error:', error);
    return {
      statusCode: isTimeout ? 504 : 500,
      body: JSON.stringify({ error: isTimeout ? 'OpenRouter API timed out' : error.message }),
    };
  }
};
