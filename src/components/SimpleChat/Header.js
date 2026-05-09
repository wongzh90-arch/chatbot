import React from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore.js';
import { useProviderStore } from '../../stores/providerStore.js';

export function Header({ isRunning }) {
    const workspace = useWorkspaceStore();
    const provider = useProviderStore();

    const headerStyle = { padding: '12px 16px', borderBottom: '1px solid #222', display: 'flex', gap: 12, flexWrap: 'wrap' };
    const inputStyle = { background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, padding: '4px 8px' };
    const buttonStyle = { background: '#222', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' };

    return React.createElement('div', { style: headerStyle },
        React.createElement('strong', { style: { color: '#f59e0b' } }, 'Self‑Recursive Bot'),
        React.createElement('input', {
            placeholder: 'owner/repo', value: workspace.currentRepo,
            onChange: e => workspace.setCurrentRepo(e.target.value), style: inputStyle
        }),
        React.createElement('input', {
            placeholder: 'branch', value: workspace.currentBranch,
            onChange: e => workspace.setCurrentBranch(e.target.value), style: inputStyle
        }),
        React.createElement('input', {
            type: 'password', placeholder: 'GitHub PAT', value: workspace.githubToken,
            onChange: e => workspace.setGithubToken(e.target.value), style: inputStyle
        }),
        React.createElement('button', {
            onClick: () => provider.setProvider(provider.provider === 'deepseek' ? 'openrouter' : 'deepseek'),
            style: buttonStyle
        }, provider.provider),
        isRunning && React.createElement('span', { style: { color: '#f59e0b' } }, '⚙️ Running...')
    );
}
