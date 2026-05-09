import React from 'react';

export function TaskList({ tasks, windowWidth }) {
    if (!tasks.length) return null;
    const isMobile = windowWidth < 768;

    return React.createElement('div', {
        style: {
            borderTop: '1px solid #222',
            background: '#111',
            padding: '8px 12px',
            maxHeight: isMobile ? 120 : 150,
            overflowY: 'auto',
            fontSize: isMobile ? 15 : 13,
        }
    },
        React.createElement('div', {
            style: {
                fontWeight: 'bold',
                fontSize: isMobile ? 14 : 12,
                marginBottom: 6,
            }
        }, '📋 Tasks'),
        tasks.map(t =>
            React.createElement('div', {
                key: t.id,
                style: {
                    fontSize: isMobile ? 14 : 12,
                    display: 'flex',
                    gap: 8,
                    padding: '4px 0',
                    flexWrap: 'wrap',
                }
            },
                React.createElement('span', {
                    style: {
                        width: isMobile ? 70 : 80,
                        color: t.status === 'DONE' ? '#4ade80' : t.status === 'FAILED' ? '#f87171' : '#fbbf24',
                        fontWeight: 'bold',
                    }
                }, t.status),
                React.createElement('span', { style: { flex: 1 } }, t.title)
            )
        )
    );
}
