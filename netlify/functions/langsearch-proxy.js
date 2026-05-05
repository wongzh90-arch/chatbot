exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const API_KEY = process.env.LANGSEARCH_API_KEY;
  if (!API_KEY) {
    console.error('LANGSEARCH_API_KEY not set');
    return { statusCode: 500, body: 'Server misconfigured: missing API key' };
  }

  try {
    const response = await fetch('https://api.langsearch.com/v1/web-search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: event.body,
    });

    const data = await response.json();
    console.log('LangSearch response status:', response.status);
    console.log('LangSearch response data:', JSON.stringify(data).substring(0, 200)); // first 200 chars

    if (!response.ok) {
      console.error('LangSearch API error:', data);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error('Proxy error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
