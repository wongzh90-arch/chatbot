// netlify/functions/openrouter-proxy.js
// Always streams — avoids Netlify's 10s sync function timeout.

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

    // Force streaming — first chunk arrives fast, keeping Netlify connection alive.
    requestBody.stream = true;

    const upstreamRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': event.headers?.origin || 'https://your-site.netlify.app',
        'X-Title': 'Claude Code Web',
      },
      body: JSON.stringify(requestBody),
    });

    if (!upstreamRes.ok) {
      const errorText = await upstreamRes.text();
      return {
        statusCode: upstreamRes.status,
        headers: { 'Content-Type': 'application/json' },
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
        console.error('OpenRouter stream error:', err);
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
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (error) {
    console.error('OpenRouter proxy error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
