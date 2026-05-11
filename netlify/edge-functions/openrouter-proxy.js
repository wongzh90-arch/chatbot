export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const API_KEY = Netlify.env.get('OPENROUTER_API_KEY');
  if (!API_KEY) {
    return new Response('Server misconfigured: missing OPENROUTER_API_KEY', { status: 500 });
  }

  try {
    const requestBody = await request.json();
    
    // Respect the client's stream setting; default to true for long requests
    if (requestBody.stream === undefined) {
      requestBody.stream = true;
    }

    const upstreamRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': request.headers.get('origin') || 'https://your-site.netlify.app',
        'X-Title': 'Claude Code Web',
      },
      body: JSON.stringify(requestBody),
    });

    if (!upstreamRes.ok) {
      const errorText = await upstreamRes.text();
      return new Response(JSON.stringify({ error: errorText }), {
        status: upstreamRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // If streaming, return SSE immediately
    if (requestBody.stream) {
      return new Response(upstreamRes.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    } else {
      const data = await upstreamRes.json();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
