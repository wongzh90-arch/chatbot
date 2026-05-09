export default async (request) => {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const token = Netlify.env.get('GITHUB_PAT');
  if (!token) {
    return new Response(JSON.stringify({ token: null, message: 'No GITHUB_PAT configured in Netlify environment' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // adjust if needed
    },
  });
};
