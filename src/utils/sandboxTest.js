export async function testCodeSandbox(code, timeoutMs = 5000) {
    // Pre-load all modules before entering the Promise executor
    const [
        { GitHubService },
        { LLMProvider },
        { ExecutorAPI },
        { ContextBuilder },
        { processAgentSkills }
    ] = await Promise.all([
        import('../services/github.js'),
        import('../services/llmProvider.js'),
        import('../services/executorApi.js'),
        import('./contextBuilder.js'),
        import('./agentSkills.js')
    ]);

    return new Promise((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.sandbox = 'allow-same-origin allow-scripts';
        document.body.appendChild(iframe);
        const win = iframe.contentWindow;

        win.GitHubService = GitHubService;
        win.LLMProvider = LLMProvider;
        win.ExecutorAPI = ExecutorAPI;
        win.ContextBuilder = ContextBuilder;
        win.processAgentSkills = processAgentSkills;
        win.fetch = fetch;
        win.atob = atob;
        win.btoa = btoa;

        const cleanup = () => {
            if (document.body.contains(iframe)) document.body.removeChild(iframe);
        };

        const timer = setTimeout(() => {
            cleanup();
            resolve(false);
        }, timeoutMs);

        win.addEventListener('error', () => {
            clearTimeout(timer);
            cleanup();
            resolve(false);
        });

        try {
            win.eval(code);
            const TestImprover = win.SelfImprover;
            if (!TestImprover) throw new Error('SelfImprover not found');
            const testInstance = new TestImprover({
                repo: 'test/repo', branch: 'main', githubToken: 'dummy',
                provider: 'deepseek', model: 'test',
                onLog: () => {}, onTaskUpdate: () => {}, onRunComplete: () => {}
            });
            testInstance.healthCheck().then(health => {
                clearTimeout(timer);
                cleanup();
                resolve(health === 'ok');
            }).catch(() => {
                clearTimeout(timer);
                cleanup();
                resolve(false);
            });
        } catch {
            clearTimeout(timer);
            cleanup();
            resolve(false);
        }
    });
}
