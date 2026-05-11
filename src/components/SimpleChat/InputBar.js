import React from 'react';

export function InputBar({ input, setInput, onSend, windowWidth, settings }) {
    const isMobile = windowWidth < 768;
    const compact = settings?.compact;

    const containerStyle = {
        borderTop: '1px solid #1a1a1a',
        padding: compact ? '8px 12px' : '12px',
        display: 'flex',
        gap: 8,
        background: '#0a0a0a',
        flexDirection: isMobile ? 'column' : 'row',
        flexShrink: 0,
        alignItems: 'center'
    };

    const inputStyle = {
        flex: 1,
        background: '#141414',
        border: '1px solid #262626',
        borderRadius: 8,
        padding: isMobile ? '10px 12px' : '10px 14px',
        color: '#e5e5e5',
        fontSize: 15,
        lineHeight: 1.5,
        width: isMobile ? '100%' : undefined,
        outline: 'none',
        transition: 'border-color 0.2s'
    };

    const buttonStyle = {
        background: '#f59e0b',
        border: 'none',
        borderRadius: 8,
        padding: isMobile ? '10px 20px' : '10px 22px',
        fontWeight: 'bold',
        fontSize: 14,
        cursor: 'pointer',
        minWidth: isMobile ? '100%' : 70,
        color: '#000'
    };

    return React.createElement('div', { style: containerStyle },
        React.createElement('input', {
            type: 'text',
            value: input,
            onChange: e => setInput(e.target.value),
            onKeyDown: e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onSend();
                }
            },
            placeholder: "Ask anything, or type /self-improve 'goal'",
            style: inputStyle,
        }),
        React.createElement('button', {
            onClick: onSend,
            style: buttonStyle,
        }, 'Send')
    );
}
