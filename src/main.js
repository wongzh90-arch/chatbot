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
    createImprover: ({ netlitySiteName, onLog, onTaskUpdate, onRunComplete,
                       onClarificationNeeded, onTokenUpdate, onPhaseChange,
                       onFileChange, onProgress }) => {
        // Get state safely inside React component context
        const workspaceState = useWorkspaceStore.getState();
        const providerState = useProviderStore.getState();
        
        return new SelfImprover({
            repo: workspaceState.currentRepo,
            branch: workspaceState.currentBranch,
            githubToken: workspaceState.githubToken,
            provider: providerState.provider,
            model: providerState.selectedModel,
            thinkingMode: providerState.thinkingMode,
            reasoningEffort: providerState.reasoningEffort,
            netlitySiteName: netlitySiteName || '',
            onLog,
            onTaskUpdate,
            onRunComplete,
            onClarificationNeeded,
            onTokenUpdate,
            onPhaseChange,
            onFileChange,
            onProgress
        });
    }
};

// GitHub token loading moved to SimpleChat component useEffect
const root = createRoot(document.getElementById('root'));
root.render(React.createElement(SimpleChat, { services }));
