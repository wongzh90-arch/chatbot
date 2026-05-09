export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const RAILWAY_URL = Netlify.env.get('RAILWAY_API_URL');
  const AUTH_TOKEN  = Netlify.env.get('RAILWAY_AUTH_TOKEN');

  if (!RAILWAY_URL) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: missing RAILWAY_API_URL' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
  if (!AUTH_TOKEN) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: missing RAILWAY_AUTH_TOKEN' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Extract endpoint suffix from the request URL, e.g. /executor-proxy/lint → /lint
  const url = new URL(request.url);
  const suffix = url.pathname.replace('/.netlify/functions/executor-proxy', '') || '/health';

  try {
    const body = await request.text();
    const upstream = await fetch(`${RAILWAY_URL}${suffix}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': AUTH_TOKEN,
      },
      body,
    });

    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};
