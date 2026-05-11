import React from 'react';
const { useState, createElement, useEffect, useRef } = React;

export function RunCard({ runState, isRunning, onPause, windowWidth, settings }) {
    const [expanded, setExpanded] = useState(false);
    const isMobile = windowWidth < 768;
    const logRef = useRef(null);
    const compact = settings?.compact;

    useEffect(() => {
        if (logRef.current && runState?.logs?.length > 0) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [runState?.logs]);

    if (!runState) return null;

    const phaseColors = { clarifying: '#60a5fa', planning: '#fbbf24', executing: '#34d399', reviewing: '#f472b6', done: '#4ade80', failed: '#f87171', paused: '#fbbf24' };
    const phaseIcons = { clarifying: '❓', planning: '📋', executing: '🔨', reviewing: '🔍', done: '✅', failed: '❌', paused: '⏸' };
    const phaseColor = phaseColors[runState.phase] || '#888';
    const phaseIcon = phaseIcons[runState.phase] || '⚙️';

    return createElement('div', {
        style: {
            background: '#111',
            border: `1px solid ${phaseColor}25`,
            borderRadius: 8,
            marginBottom: compact ? 8 : 12,
            overflow: 'hidden',
            fontSize: isMobile ? 12 : 11,
            flexShrink: 0
        }
    },
        createElement('div', {
            onClick: () => setExpanded(!expanded),
            style: {
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: compact ? '8px 12px' : '10px 14px',
                background: '#0a0a0a',
                cursor: 'pointer',
                userSelect: 'none'
            }
        },
            createElement('span', { style: { fontSize: 13 } }, phaseIcon),
            createElement('span', { style: { color: phaseColor, fontWeight: 'bold', flex: 1 } }, runState.label || runState.phase),
            runState.progress != null && createElement('span', { style: { color: '#666', fontSize: 10 } }, `${Math.round(runState.progress)}%`),
            isRunning && createElement('button', {
                onClick: (e) => { e.stopPropagation(); onPause(); },
                style: {
                    background: '#fbbf24',
                    border: 'none',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 10,
                    color: '#000',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                }
            }, '⏸'),
            createElement('span', { style: { color: '#444', fontSize: 10, marginLeft: 4 } }, expanded ? '▾' : '▸')
        ),

        runState.progress != null && createElement('div', { style: { height: 2, background: '#1a1a1a' } },
            createElement('div', { style: { height: '100%', width: `${runState.progress}%`, background: phaseColor, transition: 'width 0.3s' } })
        ),

        expanded && createElement('div', { style: { padding: compact ? '8px 12px' : '10px 14px', borderTop: '1px solid #1a1a1a' } },
            runState.tasks && runState.tasks.length > 0 && createElement('div', { style: { marginBottom: 10 } },
                createElement('div', { style: { fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontWeight: 'bold' } }, `Tasks (${runState.tasks.length})`),
                runState.tasks.map((t, i) =>
                    createElement('div', { key: i, style: { display: 'flex', gap: 8, padding: '3px 0', alignItems: 'center', fontSize: 11 } },
                        createElement('span', {
                            style: {
                                fontSize: 9,
                                padding: '1px 5px',
                                borderRadius: 3,
                                fontWeight: 'bold',
                                minWidth: 40,
                                textAlign: 'center',
                                background: t.status === 'DONE' ? '#14532d' : t.status === 'FAILED' ? '#450a0a' : '#422006',
                                color: t.status === 'DONE' ? '#4ade80' : t.status === 'FAILED' ? '#f87171' : '#fbbf24'
                            }
                        }, t.status),
                        createElement('span', { style: { flex: 1, color: '#aaa' } }, t.title)
                    )
                )
            ),

            runState.fileChanges && runState.fileChanges.length > 0 && createElement('div', { style: { marginBottom: 10 } },
                createElement('div', { style: { fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontWeight: 'bold' } }, `Files (${runState.fileChanges.length})`),
                runState.fileChanges.map((fc, i) =>
                    createElement('div', { key: i, style: { padding: '3px 0', fontSize: 11, borderBottom: '1px solid #1a1a1a' } },
                        createElement('div', { style: { color: fc.status === 'committed' ? '#4ade80' : '#fbbf24', marginBottom: 2 } }, `${fc.status === 'committed' ? '✅' : '📝'} ${fc.path}`),
                        fc.diff && createElement('pre', { style: { background: '#0a0a0a', padding: 6, borderRadius: 4, overflowX: 'auto', fontSize: 9, maxHeight: 100, overflowY: 'auto', margin: '4px 0 0 0', color: '#888' } }, fc.diff)
                    )
                )
            ),

            runState.logs && runState.logs.length > 0 && createElement('div', null,
                createElement('div', { style: { fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontWeight: 'bold' } }, `Log (${runState.logs.length})`),
                createElement('div', { ref: logRef, style: { maxHeight: 100, overflowY: 'auto', background: '#0a0a0a', padding: 8, borderRadius: 4 } },
                    runState.logs.map((line, i) =>
                        createElement('div', { key: i, style: { fontSize: 10, color: line.startsWith('❌') ? '#f87171' : line.startsWith('✅') ? '#4ade80' : line.startsWith('⚠️') ? '#fbbf24' : '#888', padding: '1px 0', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }, line)
                    )
                )
            )
        )
    );
}
