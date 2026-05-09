import React from 'react';

export function MessageList({ messages, chatEndRef }) {
    const chatAreaStyle = { flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 };
    const userMsgStyle = { alignSelf: 'flex-end', background: '#2d2d2d', maxWidth: '80%', borderRadius: 12, padding: '8px 12px' };
    const agentMsgStyle = { alignSelf: 'flex-start', background: '#1e1e1e', maxWidth: '80%', borderRadius: 12, padding: '8px 12px' };

    return React.createElement('div', { style: chatAreaStyle },
        messages.map((m, i) =>
            React.createElement('div', { key: i, style: m.role === 'user' ? userMsgStyle : agentMsgStyle },
                React.createElement('div', { style: { fontSize: 12, color: '#aaa', marginBottom: 4 } },
                    m.role === 'user' ? 'You' : 'Agent'
                ),
                React.createElement('div', { style: { whiteSpace: 'pre-wrap' } }, m.content)
            )
        ),
        React.createElement('div', { ref: chatEndRef })
    );
}
