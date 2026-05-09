import React from 'react';

export function MessageList({ messages, chatEndRef, windowWidth }) {
    const isMobile = windowWidth < 768;
    const chatAreaStyle = {
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        WebkitOverflowScrolling: 'touch',
    };

    const baseMsgStyle = {
        maxWidth: '85%',
        borderRadius: 12,
        padding: '10px 14px',
        wordBreak: 'break-word',
        fontSize: isMobile ? 17 : 15,
        lineHeight: 1.5,
    };

    const userMsgStyle = { ...baseMsgStyle, alignSelf: 'flex-end', background: '#2d2d2d' };
    const agentMsgStyle = { ...baseMsgStyle, alignSelf: 'flex-start', background: '#1e1e1e' };

    return React.createElement('div', { style: chatAreaStyle },
        messages.map((m, i) =>
            React.createElement('div', {
                key: i,
                style: m.role === 'user' ? userMsgStyle : agentMsgStyle,
            },
                React.createElement('div', {
                    style: {
                        fontSize: isMobile ? 13 : 11,
                        color: '#aaa',
                        marginBottom: 4,
                    }
                }, m.role === 'user' ? 'You' : 'Agent'),
                React.createElement('div', { style: { whiteSpace: 'pre-wrap' } }, m.content)
            )
        ),
        React.createElement('div', { ref: chatEndRef })
    );
}
