import React from 'react';
import { createRoot } from 'react-dom/client';
import { SimpleChat } from './components/SimpleChat.js';
import { useWorkspaceStore } from './stores/workspaceStore.js';
import { useProviderStore } from './stores/providerStore.js';
import { GitHubService } from './services/github.js';
import { LLMProvider } from './services/llmProvider.js';
import { ExecutorAPI } from './services/executorApi.js';
import { ContextBuilder } from './utils/contextBuilder.js';
import { processAgentSkills } from './utils/agentSkills.js';
import { SmokeTest } from './services/smokeTest.js';
import { SelfImprover } from './core/SelfImprover.js';

const services = {
    github: GitHubService,
    llm: LLMProvider,
    executorApi: ExecutorAPI,
    contextBuilder: ContextBuilder,
    agentSkills: processAgentSkills,
    smokeTest: SmokeTest,
    createImprover: ({ netlitySiteName, onLog, onTaskUpdate, onRunComplete, onClarificationNeeded }) => {
        const { currentRepo, currentBranch, githubToken } = useWorkspaceStore.getState();
        const { provider, selectedModel, thinkingMode, reasoningEffort } = useProviderStore.getState();
        return new SelfImprover({
            repo: currentRepo,
            branch: currentBranch,
            githubToken,
            provider,
            model: selectedModel,
            thinkingMode,
            reasoningEffort,
            netlitySiteName: netlitySiteName || '',
            onLog,
            onTaskUpdate,
            onRunComplete,
            onClarificationNeeded,
        });
    }
};

// Automatically load GitHub token from Netlify env if none is stored locally
(async () => {
    const { githubToken, setGithubToken } = useWorkspaceStore.getState();
    if (!githubToken) {
        try {
            const res = await fetch('/.netlify/functions/github-token');
            if (res.ok) {
                const data = await res.json();
                if (data.token) {
                    setGithubToken(data.token);
                    console.log('✅ GitHub token loaded from Netlify environment');
                }
            }
        } catch (e) {
            console.warn('Could not fetch GitHub token from Netlify:', e);
        }
    }
})();

const root = createRoot(document.getElementById('root'));
root.render(React.createElement(SimpleChat, { services }));
