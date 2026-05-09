export async function testCodeSandbox(code, timeoutMs = 5000) {
    return new Promise((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.sandbox = 'allow-same-origin allow-scripts';
        document.body.appendChild(iframe);
        const win = iframe.contentWindow;

        // Copy essential dependencies into iframe (they are ES modules, but we copy the class references)
        // Note: we need to re-export them into the iframe's global scope.
        // Since they are classes, we can just assign them.
        // However they might rely on fetch – fetch is global.
        win.GitHubService = (await import('../services/github.js')).GitHubService;
        win.LLMProvider = (await import('../services/llmProvider.js')).LLMProvider;
        win.ExecutorAPI = (await import('../services/executorApi.js')).ExecutorAPI;
        win.ContextBuilder = (await import('./contextBuilder.js')).ContextBuilder;
        win.processAgentSkills = (await import('./agentSkills.js')).processAgentSkills;
        win.fetch = fetch;
        win.atob = atob;
        win.btoa = btoa;

        let timer = setTimeout(() => {
            document.body.removeChild(iframe);
            resolve(false);
        }, timeoutMs);

        win.addEventListener('error', (e) => {
            clearTimeout(timer);
            document.body.removeChild(iframe);
            resolve(false);
        });

        try {
            win.eval(code);
            const TestImprover = win.SelfImprover;
            if (!TestImprover) throw new Error('SelfImprover not found');
            const testInstance = new TestImprover({
                repo: 'test/repo', branch: 'main', githubToken: 'dummy',
                provider: 'deepseek', model: 'test', onLog: () => {}, onTaskUpdate: () => {}, onRunComplete: () => {}
            });
            const health = testInstance.healthCheck ? await testInstance.healthCheck() : 'ok';
            if (health !== 'ok') throw new Error('Health check failed');
            clearTimeout(timer);
            document.body.removeChild(iframe);
            resolve(true);
        } catch (err) {
            clearTimeout(timer);
            document.body.removeChild(iframe);
            resolve(false);
        }
    });
}
