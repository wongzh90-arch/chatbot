import React from 'react';
import { RunCard } from './RunCard.js';
import { MessageContent } from './MessageContent.js';
const { createElement } = React;

export function ChatPane({ messages, chatEndRef, windowWidth, runState, isRunning, onPause, settings }) {
    const isMobile = windowWidth < 768;
    const chatAreaStyle = {
        flex: 1,
        overflowY: 'auto',
        padding: isMobile ? '8px' : '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: settings.compact ? 10 : 18,
        WebkitOverflowScrolling: 'touch',
        background: '#0a0a0a'
    };

    const userMsgStyle = {
        alignSelf: 'flex-end',
        maxWidth: isMobile ? '92%' : '80%',
        background: '#171717',
        borderRadius: 12,
        padding: '10px 14px',
        border: '1px solid #262626'
    };

    const agentMsgStyle = {
        alignSelf: 'flex-start',
        maxWidth: '100%',
        width: '100%',
        padding: isMobile ? '0 4px' : '0 8px',
    };

    return createElement('div', { style: chatAreaStyle },
        (isRunning || runState) && createElement(RunCard, { runState, isRunning, onPause, windowWidth, settings }),
        messages.map((m, i) => {
            const isUser = m.role === 'user';
            return createElement('div', { key: i, style: isUser ? userMsgStyle : agentMsgStyle },
                createElement('div', {
                    style: {
                        fontSize: isMobile ? 10 : 9,
                        color: '#555',
                        marginBottom: 6,
                        fontWeight: 'bold',
                        letterSpacing: 0.8,
                        textTransform: 'uppercase'
                    }
                }, isUser ? 'You' : 'Agent'),
                createElement(MessageContent, {
                    content: m.content,
                    isUser,
                    fontSize: settings.fontSize,
                    compact: settings.compact
                })
            );
        }),
        createElement('div', { ref: chatEndRef })
    );
}
