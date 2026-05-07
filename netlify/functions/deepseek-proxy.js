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
    const wantsStream = requestBody.stream === true;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 29000);

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

    if (!wantsStream) {
      // Non‑streaming: collect full response and return JSON
      const data = await upstreamRes.json();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      };
    }

    // Streaming: pipe the raw SSE stream
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
        console.error('Stream error:', err);
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
    return {
      statusCode: isTimeout ? 504 : 500,
      body: JSON.stringify({ error: isTimeout ? 'Timeout' : error.message }),
    };
  }
};
