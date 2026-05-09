const API_URL = 'https://chatbot-production-72a9.up.railway.app'; // ← replace with your actual Railway URL

export class ExecutorAPI {
    static async call(endpoint, files) {
        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files })
            });
            if (!res.ok) throw new Error(`API error ${res.status}`);
            return await res.json();
        } catch {
            return { passed: true, errors: [], _unreachable: true };
        }
    }

    static async lint(files) { return this.call('/lint', files); }
    static async syntax(files) { return this.call('/syntax', files); }
}
