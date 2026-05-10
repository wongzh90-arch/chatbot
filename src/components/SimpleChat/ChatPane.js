import React from 'react';
import { RunCard } from './RunCard.js';
const { createElement } = React;

export function ChatPane({ messages, chatEndRef, windowWidth, runState, isRunning, onPause }) {
    const isMobile = windowWidth < 768;
    const chatAreaStyle = { flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, WebkitOverflowScrolling: 'touch' };
    const baseMsgStyle = { maxWidth: '85%', borderRadius: 12, padding: '10px 14px', wordBreak: 'break-word', fontSize: isMobile ? 17 : 15, lineHeight: 1.5 };
    const userMsgStyle = { ...baseMsgStyle, alignSelf: 'flex-end', background: '#2d2d2d' };
    const agentMsgStyle = { ...baseMsgStyle, alignSelf: 'flex-start', background: '#1e1e1e' };

    return createElement('div', { style: chatAreaStyle },
        (isRunning || runState) && createElement(RunCard, { runState, isRunning, onPause, windowWidth }),
        messages.map((m, i) => {
            return createElement('div', { key: i, style: m.role === 'user' ? userMsgStyle : agentMsgStyle },
                createElement('div', { style: { fontSize: isMobile ? 13 : 11, color: '#aaa', marginBottom: 4 } }, m.role === 'user' ? 'You' : 'Agent'),
                createElement('div', { style: { whiteSpace: 'pre-wrap' } }, m.content)
            );
        }),
        createElement('div', { ref: chatEndRef })
    );
}
