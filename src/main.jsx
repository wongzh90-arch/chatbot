import React from 'react';
import { createRoot } from 'react-dom/client';
import { SimpleChat } from './components/SimpleChat.jsx';
import { useWorkspaceStore } from './stores/workspaceStore.js';
import { useProviderStore } from './stores/providerStore.js';
import { GitHubService } from './services/github.js';
import { LLMProvider } from './services/llmProvider.js';
import { ExecutorAPI } from './services/executorApi.js';
import { ContextBuilder } from './utils/contextBuilder.js';
import { processAgentSkills } from './utils/agentSkills.js';
import { SmokeTest } from './services/smokeTest.js';
import { SelfImprover } from './core/SelfImprover.js';

// Expose services to the UI (via props, not globals)
const services = {
    github: GitHubService,
    llm: LLMProvider,
    executorApi: ExecutorAPI,
    contextBuilder: ContextBuilder,
    agentSkills: processAgentSkills,
    smokeTest: SmokeTest,
    createImprover: (callbacks) => {
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
            ...callbacks
        });
    }
};

const root = createRoot(document.getElementById('root'));
root.render(<SimpleChat services={services} />);
