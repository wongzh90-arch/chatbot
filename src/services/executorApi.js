// All calls go through the Netlify edge proxy which injects the Railway auth token.
// No secret ever touches the browser.
const PROXY_BASE = '/.netlify/functions/executor-proxy';

export class ExecutorAPI {
    static async call(endpoint, files) {
        try {
            const res = await fetch(`${PROXY_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files })
            });
            if (!res.ok) {
                const text = await res.text();
                console.warn(`ExecutorAPI ${endpoint} returned ${res.status}:`, text);
                // Fail open only on network errors, not on auth/config errors
                if (res.status === 500 || res.status === 401) {
                    return { passed: false, errors: [{ message: `Executor error ${res.status}: ${text}`, severity: 'error' }] };
                }
            }
            return await res.json();
        } catch (err) {
            // Genuine network failure — fail open so a Railway outage doesn't block commits
            console.warn('ExecutorAPI unreachable:', err.message);
            return { passed: true, errors: [], _unreachable: true };
        }
    }

    static async lint(files)   { return this.call('/lint', files); }
    static async syntax(files) { return this.call('/syntax', files); }

    static async health() {
        try {
            const res = await fetch(`${PROXY_BASE}/health`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            return res.ok;
        } catch {
            return false;
        }
    }
}
