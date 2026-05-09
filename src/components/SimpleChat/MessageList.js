import React from 'react';

export function MessageList({ messages, chatEndRef }) {
    const chatAreaStyle = {
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        WebkitOverflowScrolling: 'touch', // smooth scroll on iOS
    };

    const userMsgStyle = {
        alignSelf: 'flex-end',
        background: '#2d2d2d',
        maxWidth: '85%',
        borderRadius: 12,
        padding: '10px 14px',
        wordBreak: 'break-word',
        fontSize: 15,
    };

    const agentMsgStyle = {
        alignSelf: 'flex-start',
        background: '#1e1e1e',
        maxWidth: '85%',
        borderRadius: 12,
        padding: '10px 14px',
        wordBreak: 'break-word',
        fontSize: 15,
    };

    return React.createElement('div', { style: chatAreaStyle },
        messages.map((m, i) =>
            React.createElement('div', {
                key: i,
                style: m.role === 'user' ? userMsgStyle : agentMsgStyle,
            },
                React.createElement('div', {
                    style: { fontSize: 11, color: '#aaa', marginBottom: 4 }
                }, m.role === 'user' ? 'You' : 'Agent'),
                React.createElement('div', {
                    style: { whiteSpace: 'pre-wrap', lineHeight: 1.4 }
                }, m.content)
            )
        ),
        React.createElement('div', { ref: chatEndRef })
    );
}
