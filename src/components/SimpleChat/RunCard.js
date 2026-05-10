import React from 'react';
const { useState, createElement, useEffect, useRef } = React;

export function RunCard({ runState, isRunning, onPause, windowWidth }) {
    const [expanded, setExpanded] = useState({ logs: true, files: true, tasks: true });
    const isMobile = windowWidth < 768;
    const logRef = useRef(null);

    useEffect(() => {
        if (logRef.current && runState?.logs?.length > 0) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [runState?.logs]);

    const toggle = (section) => setExpanded(prev => ({ ...prev, [section]: !prev[section] }));

    if (!runState) return null;

    const phaseColors = { clarifying: '#60a5fa', planning: '#fbbf24', executing: '#34d399', reviewing: '#f472b6', done: '#4ade80', failed: '#f87171', paused: '#fbbf24' };
    const phaseIcons = { clarifying: '❓', planning: '📋', executing: '🔨', reviewing: '🔍', done: '✅', failed: '❌', paused: '⏸' };
    const phaseColor = phaseColors[runState.phase] || '#888';
    const phaseIcon = phaseIcons[runState.phase] || '⚙️';

    return createElement('div', { style: { background: '#111', border: `1px solid ${phaseColor}33`, borderRadius: 8, marginBottom: 12, overflow: 'hidden', fontSize: isMobile ? 14 : 13 } },
        createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#0a0a0a', borderBottom: '1px solid #222' } },
            createElement('span', { style: { fontSize: 16 } }, phaseIcon),
            createElement('span', { style: { color: phaseColor, fontWeight: 'bold', flex: 1 } }, runState.label || runState.phase),
            runState.progress != null && createElement('span', { style: { color: '#aaa', fontSize: 12 } }, `${Math.round(runState.progress)}%`),
            isRunning && createElement('button', { onClick: onPause, style: { background: '#fbbf24', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, color: '#000', cursor: 'pointer' } }, '⏸ Pause')
        ),
        runState.progress != null && createElement('div', { style: { height: 2, background: '#222' } }, createElement('div', { style: { height: '100%', width: `${runState.progress}%`, background: phaseColor, transition: 'width 0.3s' } })),
        createElement('div', { style: { padding: '0 14px' } },
            // tasks
            runState.tasks && runState.tasks.length > 0 && createElement('div', null,
                createElement('div', { onClick: () => toggle('tasks'), style: { display: 'flex', gap: 6, padding: '8px 0', cursor: 'pointer', color: '#aaa', fontSize: 12 } },
                    createElement('span', null, expanded.tasks ? '▼' : '▶'),
                    createElement('span', null, `Tasks (${runState.tasks.length})`)
                ),
                expanded.tasks && runState.tasks.map((t, i) =>
                    createElement('div', { key: i, style: { display: 'flex', gap: 8, padding: '4px 0 4px 16px', borderBottom: '1px solid #1a1a1a', alignItems: 'center' } },
                        createElement('span', { style: { fontSize: 10, padding: '2px 6px', borderRadius: 3, fontWeight: 'bold', minWidth: 50, textAlign: 'center', background: t.status === 'DONE' ? '#14532d' : t.status === 'FAILED' ? '#450a0a' : '#422006', color: t.status === 'DONE' ? '#4ade80' : t.status === 'FAILED' ? '#f87171' : '#fbbf24' } }, t.status),
                        createElement('span', { style: { flex: 1, fontSize: isMobile ? 13 : 12 } }, t.title)
                    )
                )
            ),
            // files
            runState.fileChanges && runState.fileChanges.length > 0 && createElement('div', null,
                createElement('div', { onClick: () => toggle('files'), style: { display: 'flex', gap: 6, padding: '8px 0', cursor: 'pointer', color: '#aaa', fontSize: 12 } },
                    createElement('span', null, expanded.files ? '▼' : '▶'),
                    createElement('span', null, `Files (${runState.fileChanges.length})`)
                ),
                expanded.files && runState.fileChanges.map((fc, i) =>
                    createElement('div', { key: i, style: { padding: '6px 0 6px 16px', borderBottom: '1px solid #1a1a1a', fontSize: isMobile ? 13 : 12 } },
                        createElement('div', { style: { color: fc.status === 'committed' ? '#4ade80' : '#fbbf24', marginBottom: 4 } }, `${fc.status === 'committed' ? '✅' : '📝'} ${fc.path}`),
                        fc.diff && createElement('pre', { style: { background: '#0a0a0a', padding: 8, borderRadius: 4, overflowX: 'auto', fontSize: isMobile ? 11 : 10, maxHeight: 200, overflowY: 'auto', margin: 0 } }, fc.diff)
                    )
                )
            ),
            // logs
            runState.logs && runState.logs.length > 0 && createElement('div', null,
                createElement('div', { onClick: () => toggle('logs'), style: { display: 'flex', gap: 6, padding: '8px 0', cursor: 'pointer', color: '#aaa', fontSize: 12 } },
                    createElement('span', null, expanded.logs ? '▼' : '▶'),
                    createElement('span', null, `Log (${runState.logs.length} lines)`)
                ),
                expanded.logs && createElement('div', { ref: logRef, style: { maxHeight: 150, overflowY: 'auto', background: '#0a0a0a', padding: 8, borderRadius: 4, marginBottom: 8 } },
                    runState.logs.map((line, i) =>
                        createElement('div', { key: i, style: { fontSize: isMobile ? 12 : 10, color: line.startsWith('❌') ? '#f87171' : line.startsWith('✅') ? '#4ade80' : line.startsWith('⚠️') ? '#fbbf24' : '#aaa', padding: '1px 0', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }, line)
                    )
                )
            )
        )
    );
}
