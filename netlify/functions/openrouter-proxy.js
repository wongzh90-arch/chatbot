// netlify/functions/openrouter-proxy.js
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const API_KEY = process.env.OPENROUTER_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, body: 'Server misconfigured: missing API key' };
  }

  try {
    let requestBody = JSON.parse(event.body);
    const isStreaming = requestBody.stream === true;

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

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: errorText }),
      };
    }

    if (isStreaming) {
      // Stream the response body directly to the client
      return new Response(response.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      const data = await response.json();
      return {
        statusCode: 200,
        body: JSON.stringify(data),
      };
    }
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
