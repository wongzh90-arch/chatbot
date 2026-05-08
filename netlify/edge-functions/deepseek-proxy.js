export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const API_KEY = Netlify.env.get('DEEPSEEK_API_KEY');
  if (!API_KEY) {
    return new Response('Missing DEEPSEEK_API_KEY', { status: 500 });
  }

  try {
    const requestBody = await request.json();
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
      return new Response(JSON.stringify({ error: errorText }), {
        status: upstreamRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(upstreamRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
