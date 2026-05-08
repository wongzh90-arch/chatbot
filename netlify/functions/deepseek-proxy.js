// netlify/functions/deepseek-proxy.js
// Always streams — avoids Netlify's 10s sync function timeout.
// Non-streaming callers (chatCompletion) still work: llmProvider.js
// collects the full stream client-side before resolving.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const API_KEY = process.env.DEEPSEEK_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, body: 'Missing DEEPSEEK_API_KEY' };
  }

  try {
    const requestBody = JSON.parse(event.body);

    // Force streaming regardless of what caller requested.
    // llmProvider.js handles both cases via chatCompletionStream internally.
    requestBody.stream = true;

    const upstreamRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
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

    // Pipe the SSE stream directly to the client.
    // First chunk arrives within ~1-2s, so Netlify's gateway never times out.
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
        console.error('DeepSeek stream error:', err);
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
    console.error('DeepSeek proxy error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
