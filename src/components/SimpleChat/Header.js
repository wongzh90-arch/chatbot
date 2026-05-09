import React from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore.js';
import { useProviderStore } from '../../stores/providerStore.js';

export function Header({ isRunning }) {
    const workspace = useWorkspaceStore();
    const provider = useProviderStore();

    // Responsive styles via media query logic in JS
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    const containerStyle = {
        padding: '12px 16px',
        borderBottom: '1px solid #222',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        background: '#0a0a0a',
    };

    if (isMobile) {
        containerStyle.flexDirection = 'column';
        containerStyle.alignItems = 'stretch';
    }

    const inputStyle = {
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 6,
        padding: '6px 10px',
        fontSize: 14,
        color: 'white',
        width: isMobile ? '100%' : 150,
        minWidth: 0,
    };

    const buttonStyle = {
        background: '#222',
        border: 'none',
        borderRadius: 6,
        padding: '6px 12px',
        fontSize: 14,
        color: 'white',
        width: isMobile ? '100%' : 'auto',
    };

    return React.createElement('div', { style: containerStyle },
        React.createElement('strong', {
            style: {
                color: '#f59e0b',
                fontSize: isMobile ? 18 : 20,
                whiteSpace: 'nowrap',
            }
        }, 'Self‑Recursive Bot'),

        React.createElement('div', {
            style: {
                display: 'flex',
                gap: 8,
                flex: 1,
                flexWrap: 'wrap',
                ...(isMobile ? { flexDirection: 'column' } : {})
            }
        },
            React.createElement('input', {
                placeholder: 'owner/repo',
                value: workspace.currentRepo,
                onChange: e => workspace.setCurrentRepo(e.target.value),
                style: inputStyle,
            }),
            React.createElement('input', {
                placeholder: 'branch',
                value: workspace.currentBranch,
                onChange: e => workspace.setCurrentBranch(e.target.value),
                style: inputStyle,
            }),
            React.createElement('input', {
                type: 'password',
                placeholder: 'GitHub PAT',
                value: workspace.githubToken,
                onChange: e => workspace.setGithubToken(e.target.value),
                style: inputStyle,
            }),
        ),

        React.createElement('button', {
            onClick: () => provider.setProvider(provider.provider === 'deepseek' ? 'openrouter' : 'deepseek'),
            style: buttonStyle,
        }, provider.provider),

        isRunning && React.createElement('span', {
            style: {
                color: '#f59e0b',
                fontSize: 14,
                ...(isMobile ? { width: '100%', textAlign: 'center' } : {}),
            }
        }, '⚙️ Running...')
    );
}
