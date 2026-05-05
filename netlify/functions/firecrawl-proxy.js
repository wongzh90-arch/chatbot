exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
  if (!FIRECRAWL_API_KEY) {
    console.error('FIRECRAWL_API_KEY not set');
    return { statusCode: 500, body: 'Server misconfigured: missing Firecrawl API key' };
  }

  try {
    const { query, count = 5 } = JSON.parse(event.body);

    // Firecrawl /v1/search expects: query, limit, scrapeOptions (optional)
    const requestBody = {
      query,
      limit: count,
      // scrapeOptions: { formats: ['markdown'] }   // uncomment if you want full page content
    };

    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.log('Firecrawl response status:', response.status);

    if (!response.ok) {
      console.error('Firecrawl API error:', JSON.stringify(data).substring(0, 300));
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data }),
      };
    }

    // Firecrawl v1/search returns: { success: true, data: [...] }
    const results = (data.data || []).map(page => ({
      title: page.title || '',
      url: page.url,
      snippet: page.description || page.content?.substring(0, 300) || '',
      datePublished: null,
      siteName: extractDomain(page.url),
      source: 'firecrawl'
    }));

    return {
      statusCode: 200,
      body: JSON.stringify(results),
    };
  } catch (error) {
    console.error('Proxy error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}
