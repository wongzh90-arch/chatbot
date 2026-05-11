import React from 'react';
const { createElement } = React;

export function Sidebar({ settings, setSettings, workspace, provider, runState, isRunning, windowWidth }) {
    if (!settings.sidebarOpen) return null;

    const isMobile = windowWidth < 768;
    const width = isMobile ? '100%' : 260;

    const panelStyle = {
        width,
        height: '100%',
        background: '#0f0f0f',
        borderRight: '1px solid #1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
        zIndex: 10
    };

    const sectionStyle = {
        padding: '16px',
        borderBottom: '1px solid #1a1a1a'
    };

    const labelStyle = {
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        color: '#555',
        marginBottom: 10,
        fontWeight: 'bold'
    };

    const inputStyle = {
        width: '100%',
        background: '#141414',
        border: '1px solid #262626',
        borderRadius: 6,
        padding: '8px 10px',
        color: '#e5e5e5',
        fontSize: 12,
        marginBottom: 8,
        outline: 'none'
    };

    const smallBtn = (active, onClick, label) => createElement('button', {
        onClick,
        style: {
            flex: 1,
            padding: '5px 0',
            background: active ? '#262626' : '#141414',
            border: '1px solid #333',
            borderRadius: 4,
            color: active ? '#e5e5e5' : '#666',
            cursor: 'pointer',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 0.5
        }
    }, label);

    return createElement('div', { style: panelStyle },
        createElement('div', { style: sectionStyle },
            createElement('div', { style: labelStyle }, 'Workspace'),
            createElement('input', {
                placeholder: 'owner/repo',
                value: workspace.currentRepo,
                onChange: e => workspace.setCurrentRepo(e.target.value),
                style: inputStyle
            }),
            createElement('input', {
                placeholder: 'branch',
                value: workspace.currentBranch,
                onChange: e => workspace.setCurrentBranch(e.target.value),
                style: inputStyle
            }),
            createElement('input', {
                type: 'password',
                placeholder: 'GitHub PAT',
                value: workspace.githubToken,
                onChange: e => workspace.setGithubToken(e.target.value),
                style: inputStyle
            })
        ),

        (isRunning || runState) && createElement('div', { style: sectionStyle },
            createElement('div', { style: labelStyle }, 'Run Context'),
            createElement('div', { style: { fontSize: 12, color: '#888', marginBottom: 4 } }, `Phase: ${runState?.phase || 'idle'}`),
            runState?.progress != null && createElement('div', { style: { fontSize: 12, color: '#888' } }, `Progress: ${Math.round(runState.progress)}%`),
            runState?.fileChanges?.length > 0 && createElement('div', { style: { fontSize: 11, color: '#555', marginTop: 6 } }, `${runState.fileChanges.length} file(s) changed`)
        ),

        createElement('div', { style: { ...sectionStyle, borderBottom: 'none', flex: 1, overflowY: 'auto' } },
            createElement('div', { style: labelStyle }, 'Appearance'),

            createElement('div', { style: { marginBottom: 14 } },
                createElement('div', { style: { fontSize: 11, color: '#666', marginBottom: 6 } }, 'Font Size'),
                createElement('div', { style: { display: 'flex', gap: 6 } },
                    smallBtn(settings.fontSize === 'sm', () => setSettings(s => ({ ...s, fontSize: 'sm' })), 'sm'),
                    smallBtn(settings.fontSize === 'md', () => setSettings(s => ({ ...s, fontSize: 'md' })), 'md'),
                    smallBtn(settings.fontSize === 'lg', () => setSettings(s => ({ ...s, fontSize: 'lg' })), 'lg')
                )
            ),

            createElement('div', { style: { marginBottom: 14 } },
                createElement('div', { style: { fontSize: 11, color: '#666', marginBottom: 6 } }, 'Density'),
                createElement('button', {
                    onClick: () => setSettings(s => ({ ...s, compact: !s.compact })),
                    style: {
                        width: '100%',
                        padding: '6px 10px',
                        background: settings.compact ? '#262626' : '#141414',
                        border: '1px solid #333',
                        borderRadius: 4,
                        color: settings.compact ? '#e5e5e5' : '#666',
                        cursor: 'pointer',
                        fontSize: 11,
                        textAlign: 'left'
                    }
                }, settings.compact ? 'Compact: On' : 'Compact: Off')
            ),

            createElement('div', { style: { marginBottom: 14 } },
                createElement('div', { style: { fontSize: 11, color: '#666', marginBottom: 6 } }, 'Theme'),
                createElement('button', {
                    onClick: () => setSettings(s => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' })),
                    style: {
                        width: '100%',
                        padding: '6px 10px',
                        background: '#141414',
                        border: '1px solid #333',
                        borderRadius: 4,
                        color: '#666',
                        cursor: 'pointer',
                        fontSize: 11,
                        textAlign: 'left'
                    }
                }, settings.theme === 'dark' ? 'Dark' : 'Light')
            ),

            createElement('div', { style: { marginTop: 20, paddingTop: 14, borderTop: '1px solid #1a1a1a' } },
                createElement('div', { style: { fontSize: 10, color: '#444', lineHeight: 1.5 } },
                    'Provider: ', provider.provider,
                    React.createElement('br'),
                    'Model: ', provider.selectedModel
                )
            )
        )
    );
}
