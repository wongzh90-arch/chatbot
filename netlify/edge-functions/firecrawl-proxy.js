export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const FIRECRAWL_API_KEY = Netlify.env.get('FIRECRAWL_API_KEY');
  if (!FIRECRAWL_API_KEY) {
    return new Response('Server misconfigured: missing Firecrawl API key', { status: 500 });
  }

  try {
    const { query, count = 5 } = await request.json();

    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit: count }),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ error: data }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const results = (data.data || []).map(page => ({
      title: page.title || '',
      url: page.url,
      snippet: page.description || page.content?.substring(0, 300) || '',
      datePublished: null,
      siteName: extractDomain(page.url),
      source: 'firecrawl'
    }));

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}
