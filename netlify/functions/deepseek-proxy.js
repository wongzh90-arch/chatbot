exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const API_KEY = process.env.DEEPSEEK_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, body: 'Server misconfigured: missing DEEPSEEK_API_KEY environment variable' };
  }

  try {
    const requestBody = JSON.parse(event.body);
    // stream is not supported, always send non-streaming
    requestBody.stream = false;

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('DeepSeek API error:', JSON.stringify(data).substring(0, 500));
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data }),
      };
    }

    const message = data.choices?.[0]?.message || {};
    const result = {
      choices: [
        {
          message: {
            content: message.content || '',
            reasoning_content: message.reasoning_content || null,
          },
        },
      ],
      model: data.model || requestBody.model || 'deepseek',
      usage: data.usage || null,
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('DeepSeek proxy error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
