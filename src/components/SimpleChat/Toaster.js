import React from 'react';

export function Toaster({ toast }) {
    if (!toast) return null;
    return React.createElement('div', {
        style: {
            position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
            background: '#222', border: `1px solid ${toast.type === 'error' ? '#f87171' : '#4ade80'}`,
            borderRadius: 8, padding: '6px 12px', fontSize: 12
        }
    }, toast.msg);
}
