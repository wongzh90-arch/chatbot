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
    
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        pageOptions: {
          fetchPageContent: false,   // set true if you want full page text (costs more)
          limit: count
        }
      }),
    });

    const data = await response.json();
    console.log('Firecrawl response status:', response.status);
    console.log('Firecrawl response data:', JSON.stringify(data).substring(0, 200));

    if (!response.ok) {
      console.error('Firecrawl API error:', data);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data }),
      };
    }

    // Firecrawl returns { success: true, data: [...] }
    const results = (data.data || []).map(page => ({
      title: page.title || '',
      url: page.url,
      snippet: page.content ? page.content.substring(0, 300) : '',   // first 300 chars as snippet
      datePublished: null,           // Firecrawl doesn't provide dates
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
