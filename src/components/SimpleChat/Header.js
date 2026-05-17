import React from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore.js';
import { useProviderStore } from '../../stores/providerStore.js';

export function Header({ isRunning, windowWidth, settings, setSettings }) {
    const workspace = useWorkspaceStore();
    const provider = useProviderStore();
    const isMobile = windowWidth < 768;
    const isLight = settings.theme === 'light';

    const containerStyle = {
        padding: '10px 16px',
        borderBottom: `1px solid ${isLight ? '#ddd' : '#1a1a1a'}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: isLight ? '#f5f5f5' : '#0a0a0a',
        flexShrink: 0,
    };

    return React.createElement('div', { style: containerStyle },
        React.createElement('button', {
            onClick: () => setSettings(s => ({ ...s, sidebarOpen: !s.sidebarOpen })),
            style: {
                background: 'none',
                border: 'none',
                color: isLight ? '#555' : '#888',
                fontSize: 18,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 4,
                lineHeight: 1,
                minHeight: 32,
                minWidth: 32
            }
        }, '☰'),

        React.createElement('strong', {
            style: {
                color: '#f59e0b',
                fontSize: isMobile ? 17 : 15,
                whiteSpace: 'nowrap',
                letterSpacing: 0.3
            }
        }, 'Self‑Recursive Bot'),

        !settings.sidebarOpen && workspace.currentRepo && React.createElement('span', {
            style: {
                color: isLight ? '#666' : '#555',
                fontSize: 11,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 120,
                fontFamily: 'monospace'
            }
        }, workspace.currentRepo),

        React.createElement('div', { style: { flex: 1 } }),

        React.createElement('button', {
            onClick: () => provider.setProvider(provider.provider === 'deepseek' ? 'openrouter' : 'deepseek'),
            style: {
                background: isLight ? '#eee' : '#141414',
                border: `1px solid ${isLight ? '#ccc' : '#2a2a2a'}`,
                borderRadius: 6,
                padding: '5px 10px',
                fontSize: 11,
                color: isLight ? '#555' : '#888',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: 0.5
            },
        }, provider.provider),

        isRunning && React.createElement('span', {
            style: {
                color: '#f59e0b',
                fontSize: 11,
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 4
            }
        }, React.createElement('span', { style: { animation: 'pulse 1.5s infinite' } }, '●'), 'Running')
    );
}
