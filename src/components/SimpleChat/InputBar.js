import React from 'react';

export function InputBar({ input, setInput, onSend }) {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    const containerStyle = {
        borderTop: '1px solid #222',
        padding: '12px',
        display: 'flex',
        gap: 8,
        background: '#0a0a0a',
    };
    if (isMobile) {
        containerStyle.flexDirection = 'column';
    }

    const inputStyle = {
        flex: 1,
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 8,
        padding: '10px 14px',
        color: 'white',
        fontSize: 16,
        lineHeight: 1.5,
        width: isMobile ? '100%' : undefined,
    };

    const buttonStyle = {
        background: '#f59e0b',
        border: 'none',
        borderRadius: 8,
        padding: '10px 20px',
        fontWeight: 'bold',
        fontSize: 16,
        cursor: 'pointer',
        minWidth: isMobile ? '100%' : 80,
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
            placeholder: "/self-improve 'add a comment'",
            style: inputStyle,
        }),
        React.createElement('button', {
            onClick: onSend,
            style: buttonStyle,
        }, 'Send')
    );
}
