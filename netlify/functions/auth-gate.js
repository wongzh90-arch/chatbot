const crypto = require('crypto');

const PASSWORD = process.env.SITE_PASSWORD;
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'change-me-to-a-random-string';

function createCookieValue(password) {
    const hmac = crypto.createHmac('sha256', COOKIE_SECRET);
    hmac.update(password);
    return hmac.digest('hex');
}

function isValidCookie(cookieValue) {
    return cookieValue === createCookieValue(PASSWORD);
}

exports.handler = async (event) => {
    const path = event.path.replace('/.netlify/functions/auth-gate', '') || '/';

    const cookieHeader = event.headers.cookie || '';
    const match = cookieHeader.match(/auth=([^;]+)/);
    if (match && isValidCookie(match[1])) {
        return {
            statusCode: 200,
            body: '',
        };
    }

    if (event.httpMethod === 'POST' && event.body) {
        const params = new URLSearchParams(event.body);
        const pass = params.get('password');
        if (pass === PASSWORD) {
            const cookieVal = createCookieValue(pass);
            const cookie = `auth=${cookieVal}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Strict`;
            return {
                statusCode: 302,
                headers: {
                    'Set-Cookie': cookie,
                    Location: path || '/',
                },
                body: '',
            };
        }
    }

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Private</title>
<style>body{background:#111;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui}
form{background:#222;padding:2rem;border-radius:8px;}
input{width:100%;padding:0.5rem;margin-bottom:1rem;border:1px solid #444;background:#333;color:#eee;border-radius:4px}
button{width:100%;padding:0.5rem;background:#f59e0b;border:none;color:#000;font-weight:bold;border-radius:4px;cursor:pointer}
</style></head><body><form method="post">
<h2>Private App</h2>
<label>Password</label>
<input name="password" type="password" required autofocus/>
<button type="submit">Login</button>
</form></body></html>`,
    };
};
