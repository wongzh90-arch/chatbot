import React from 'react';

export function TaskList({ tasks }) {
    if (!tasks.length) return null;

    return React.createElement('div', {
        style: { borderTop: '1px solid #222', background: '#111', padding: '8px 12px', maxHeight: 150, overflowY: 'auto' }
    },
        React.createElement('div', { style: { fontWeight: 'bold', fontSize: 12, marginBottom: 6 } }, '📋 Tasks'),
        tasks.map(t =>
            React.createElement('div', { key: t.id, style: { fontSize: 12, display: 'flex', gap: 8, padding: '2px 0' } },
                React.createElement('span', {
                    style: { width: 80, color: t.status === 'DONE' ? '#4ade80' : t.status === 'FAILED' ? '#f87171' : '#fbbf24' }
                }, t.status),
                React.createElement('span', null, t.title)
            )
        )
    );
}
