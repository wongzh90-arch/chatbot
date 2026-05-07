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
    requestBody.stream = false;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let response;
    try {
      response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

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
    const isTimeout = error.name === 'AbortError';
    console.error(isTimeout ? 'DeepSeek timeout' : 'DeepSeek proxy error:', error);
    return {
      statusCode: isTimeout ? 504 : 500,
      body: JSON.stringify({ error: isTimeout ? 'DeepSeek API timed out after 25s' : error.message }),
    };
  }
};
