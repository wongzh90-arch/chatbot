// netlify/functions/deepseek-proxy.js
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const API_KEY = process.env.DEEPSEEK_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, body: 'Server misconfigured: missing DEEPSEEK_API_KEY' };
  }

  try {
    const requestBody = JSON.parse(event.body);
    // Force stream: true for all requests to keep connection alive
    requestBody.stream = true;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 29000); // 29s safety

    const upstreamRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
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

    // Create a readable stream to pipe the upstream response
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Process the upstream stream and forward to client
    (async () => {
      try {
        const reader = upstreamRes.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Forward raw SSE chunks
          await writer.write(value);
        }
      } catch (err) {
        console.error('Streaming error:', err);
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
    console.error(isTimeout ? 'DeepSeek timeout' : 'DeepSeek proxy error:', error);
    return {
      statusCode: isTimeout ? 504 : 500,
      body: JSON.stringify({ error: isTimeout ? 'DeepSeek API timed out' : error.message }),
    };
  }
};
