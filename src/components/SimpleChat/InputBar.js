import React from 'react';

export function InputBar({ input, setInput, onSend }) {
  return React.createElement(
    'div',
    {
      style: {
        borderTop: '1px solid #222',
        padding: '12px',
        display: 'flex',
        gap: 8,
      },
    },
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
      style: {
        flex: 1,
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 8,
        padding: '8px 12px',
        color: 'white',
        fontSize: '16px',
        lineHeight: '1.5',
      },
    }),
    React.createElement(
      'button',
      {
        onClick: onSend,
        style: {
          background: '#f59e0b',
          border: 'none',
          borderRadius: 8,
          padding: '8px 16px',
          fontWeight: 'bold',
          cursor: 'pointer',
        },
      },
      'Send'
    )
  );
}
