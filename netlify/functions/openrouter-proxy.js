// netlify/functions/openrouter-proxy.js
exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const API_KEY = process.env.OPENROUTER_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, body: 'Server misconfigured: missing API key' };
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': event.headers.origin || 'https://your-site.netlify.app',
        'X-Title': 'Claude Code Web',
      },
      body: event.body,   // The client sends the entire OpenAI‑style request body
    });

    const data = await response.json();

    return {
      statusCode: response.status,
      body: JSON.stringify(data),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
