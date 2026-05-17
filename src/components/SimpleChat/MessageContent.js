import React from 'react';
const { createElement, useState } = React;

export function MessageContent({ content, isUser, fontSize, compact, theme }) {
    const segments = parseContent(content);
    const baseFontSize = fontSize === 'lg' ? 16 : fontSize === 'sm' ? 13 : 15;
    const isLight = theme === 'light';

    return createElement('div', {
        style: {
            fontSize: baseFontSize,
            lineHeight: compact ? 1.45 : 1.6,
            color: isUser 
                ? (isLight ? '#1a1a1a' : '#e5e5e5') 
                : (isLight ? '#333333' : '#d4d4d4')
        }
    }, segments.map((seg, i) => renderSegment(seg, i, compact, baseFontSize, isLight)));
}

function parseContent(text) {
    const segments = [];
    const codeFence = /```(\w*)\n?([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = codeFence.exec(text)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
        }
        segments.push({ type: 'code', lang: match[1] || 'text', content: match[2].trimEnd() });
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        segments.push({ type: 'text', content: text.slice(lastIndex) });
    }
    if (segments.length === 0) segments.push({ type: 'text', content: text });
    return segments;
}

function renderSegment(seg, key, compact, baseFontSize, isLight) {
    if (seg.type === 'code') {
        return createElement(CodeBlock, { key, lang: seg.lang, code: seg.content, compact, isLight });
    }
    return createElement('div', { key, style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } },
        renderTextWithBlocks(seg.content, compact, baseFontSize, isLight));
}

function renderTextWithBlocks(text, compact, baseFontSize, isLight) {
    const elements = [];
    const thinkingRegex = /<thinking>([\s\S]*?)<<\/thinking>/g;
    let last = 0;
    let m;
    let i = 0;

    while ((m = thinkingRegex.exec(text)) !== null) {
        if (m.index > last) {
            elements.push(...renderTextLines(text.slice(last, m.index), `t${i++}`, compact, baseFontSize, isLight));
        }
        elements.push(createElement(ThinkingBlock, { key: `th${i++}`, content: m[1].trim(), compact, isLight }));
        last = m.index + m[0].length;
    }

    if (last < text.length) {
        elements.push(...renderTextLines(text.slice(last), `t${i++}`, compact, baseFontSize, isLight));
    }
    if (elements.length === 0) {
        elements.push(...renderTextLines(text, `t0`, compact, baseFontSize, isLight));
    }
    return elements;
}

function renderTextLines(text, keyPrefix, compact, baseFontSize, isLight) {
    const lines = text.split('\n');
    const elements = [];
    let currentText = '';

    const flushText = (k) => {
        if (currentText) {
            elements.push(createElement('span', { key: `${keyPrefix}-line-${k}` }, renderInlineCode(currentText, baseFontSize, isLight)));
            currentText = '';
        }
    };

    lines.forEach((line, idx) => {
        const tool = parseToolBadge(line);
        if (tool) {
            flushText(idx);
            elements.push(createElement(ToolBadge, { key: `${keyPrefix}-tool-${idx}`, tool, compact }));
        } else {
            currentText += (idx > 0 ? '\n' : '') + line;
        }
    });
    flushText('end');

    return elements;
}

function parseToolBadge(line) {
    const patterns = [
        { regex: /^📖\s*Read\s+(.+)/i, type: 'read', label: 'Read' },
        { regex: /^📝\s*(.+)/i, type: 'edit', label: 'Edit' },
        { regex: /^✅\s*(.+)/i, type: 'success', label: 'Done' },
        { regex: /^❌\s*(.+)/i, type: 'error', label: 'Error' },
        { regex: /^🔍\s*(.+)/i, type: 'search', label: 'Search' },
        { regex: /^🌐\s*(.+)/i, type: 'fetch', label: 'Fetch' },
        { regex: /^🔧\s*(.+)/i, type: 'fix', label: 'Fix' },
    ];
    for (const p of patterns) {
        const m = line.match(p.regex);
        if (m) return { type: p.type, label: p.label, text: m[0] };
    }
    return null;
}

function ToolBadge({ tool, compact }) {
    const colors = {
        read: '#60a5fa', edit: '#fbbf24', success: '#4ade80',
        error: '#f87171', search: '#a78bfa', fetch: '#34d399', fix: '#fb923c'
    };
    const c = colors[tool.type] || '#888';

    return createElement('div', {
        style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            margin: compact ? '2px 0' : '4px 0',
            padding: compact ? '3px 8px' : '4px 10px',
            borderRadius: 4,
            background: `${c}12`,
            border: `1px solid ${c}25`,
            color: c,
            fontSize: 11,
            fontFamily: 'monospace',
            width: 'fit-content'
        }
    },
        createElement('span', { style: { fontWeight: 'bold' } }, tool.label),
        createElement('span', null, tool.text.replace(/^[^\s]+\s*/, ''))
    );
}

function ThinkingBlock({ content, compact, isLight }) {
    const [open, setOpen] = useState(false);
    return createElement('div', {
        style: {
            margin: compact ? '6px 0' : '10px 0',
            borderLeft: '2px solid #3b82f6',
            paddingLeft: 10
        }
    },
        createElement('button', {
            onClick: () => setOpen(!open),
            style: {
                background: 'none',
                border: 'none',
                color: '#3b82f6',
                cursor: 'pointer',
                fontSize: 11,
                fontStyle: 'italic',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                opacity: 0.75
            }
        }, open ? '▾ Hide reasoning' : '▸ Show reasoning'),
        open && createElement('div', {
            style: {
                marginTop: 6,
                color: isLight ? '#64748b' : '#94a3b8',
                fontStyle: 'italic',
                fontSize: 12,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap'
            }
        }, content)
    );
}

function CodeBlock({ lang, code, compact, isLight }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(code).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            });
        }
    };

    return createElement('div', {
        style: {
            margin: compact ? '6px 0' : '10px 0',
            borderRadius: 8,
            overflow: 'hidden',
            background: isLight ? '#f5f5f5' : '#0d0d0d',
            border: `1px solid ${isLight ? '#ddd' : '#262626'}`
        }
    },
        createElement('div', {
            style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 12px',
                background: isLight ? '#eee' : '#161616',
                borderBottom: `1px solid ${isLight ? '#ddd' : '#262626'}`
            }
        },
            createElement('span', { 
                style: { 
                    fontSize: 10, 
                    color: isLight ? '#666' : '#888', 
                    fontFamily: 'monospace', 
                    textTransform: 'uppercase', 
                    letterSpacing: 0.5 
                } 
            }, lang || 'text'),
            createElement('button', {
                onClick: handleCopy,
                style: {
                    background: 'none',
                    border: 'none',
                    color: copied ? '#4ade80' : (isLight ? '#666' : '#888'),
                    cursor: 'pointer',
                    fontSize: 11,
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontFamily: 'monospace'
                }
            }, copied ? 'Copied!' : 'Copy')
        ),
        createElement('pre', {
            style: {
                margin: 0,
                padding: compact ? '8px 12px' : '12px 16px',
                overflowX: 'auto',
                fontSize: 12,
                lineHeight: 1.5,
                background: isLight ? '#f5f5f5' : '#0d0d0d'
            }
        },
            createElement('code', {
                className: lang ? `language-${lang}` : undefined,
                style: { 
                    fontFamily: 'monospace', 
                    color: isLight ? '#1a1a1a' : '#e5e5e5' 
                }
            }, code)
        )
    );
}

function renderInlineCode(text, baseFontSize, isLight) {
    const parts = text.split(/`([^`]+)`/);
    return parts.map((part, i) => {
        if (i % 2 === 1) {
            return createElement('code', {
                key: i,
                style: {
                    background: isLight ? '#e8e8e8' : '#262626',
                    padding: '1px 4px',
                    borderRadius: 3,
                    fontFamily: 'monospace',
                    fontSize: `${baseFontSize * 0.88}px`,
                    color: isLight ? '#c2255c' : '#f472b6'
                }
            }, part);
        }
        return part;
    });
}
