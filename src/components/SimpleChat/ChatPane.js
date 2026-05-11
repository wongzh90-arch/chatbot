import React from 'react';
import { RunCard } from './RunCard.js';
import { MessageContent } from './MessageContent.js';
const { createElement, useState } = React;

export function ChatPane({ messages, chatEndRef, windowWidth, runState, isRunning, onPause, settings, onSend }) {
    const isMobile = windowWidth < 768;
    const [collapsedLogs, setCollapsedLogs] = useState(new Set());

    const chatAreaStyle = {
        flex: 1,
        overflowY: 'auto',
        padding: isMobile ? '8px' : '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: settings.compact ? 10 : 18,
        WebkitOverflowScrolling: 'touch',
        background: settings.theme === 'dark' ? '#0a0a0a' : '#f5f5f5'
    };

    const userMsgStyle = {
        alignSelf: 'flex-end',
        maxWidth: isMobile ? '92%' : '80%',
        background: settings.theme === 'dark' ? '#171717' : '#e8e8e8',
        borderRadius: 12,
        padding: '10px 14px',
        border: `1px solid ${settings.theme === 'dark' ? '#262626' : '#d0d0d0'}`
    };

    const agentMsgStyle = {
        alignSelf: 'flex-start',
        maxWidth: '100%',
        width: '100%',
        padding: isMobile ? '0 4px' : '0 8px',
    };

    const toggleLogCollapse = (msgId) => {
        setCollapsedLogs(prev => {
            const next = new Set(prev);
            if (next.has(msgId)) next.delete(msgId);
            else next.add(msgId);
            return next;
        });
    };

    // Render inline log entry as a collapsible message
    const renderLogEntry = (log, idx) => {
        const isCollapsed = collapsedLogs.has(`log-${idx}`);
        const isError = log.startsWith('❌') || log.includes('error') || log.includes('failed');
        const isSuccess = log.startsWith('✅') || log.startsWith('✔');
        const isWarning = log.startsWith('⚠️') || log.startsWith('⏭');
        
        let icon = '⚙️';
        let color = '#888';
        if (isError) { icon = '❌'; color = '#f87171'; }
        else if (isSuccess) { icon = '✅'; color = '#4ade80'; }
        else if (isWarning) { icon = '⚠️'; color = '#fbbf24'; }
        else if (log.startsWith('🔍')) { icon = '🔍'; color = '#a78bfa'; }
        else if (log.startsWith('📁')) { icon = '📁'; color = '#60a5fa'; }
        else if (log.startsWith('🌿')) { icon = '🌿'; color = '#34d399'; }

        return createElement('div', {
            key: `log-${idx}`,
            style: {
                alignSelf: 'flex-start',
                maxWidth: '95%',
                background: settings.theme === 'dark' ? '#111' : '#f0f0f0',
                borderRadius: 8,
                padding: isCollapsed ? '6px 12px' : '8px 12px',
                border: `1px solid ${settings.theme === 'dark' ? '#1a1a1a' : '#e0e0e0'`,
                marginBottom: 4,
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'monospace',
                color: color,
                transition: 'all 0.2s'
            },
            onClick: () => toggleLogCollapse(`log-${idx}`)
        },
            createElement('div', { 
                style: { 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 6,
                    opacity: 0.85
                } 
            },
                createElement('span', null, icon),
                createElement('span', { 
                    style: { 
                        flex: 1, 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis',
                        color: settings.theme === 'dark' ? '#aaa' : '#555'
                    } 
                }, isCollapsed ? log.slice(0, 60) + '...' : log),
                createElement('span', { 
                    style: { 
                        fontSize: 9, 
                        color: '#666',
                        marginLeft: 4
                    } 
                }, isCollapsed ? '▸' : '▾')
            ),
            !isCollapsed && createElement('div', {
                style: {
                    marginTop: 6,
                    paddingTop: 6,
                    borderTop: `1px solid ${settings.theme === 'dark' ? '#1a1a1a' : '#e0e0e0'}`,
                    color: settings.theme === 'dark' ? '#888' : '#666',
                    fontSize: 10,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all'
                }
            }, log)
        );
    };

    // Interleave messages with logs when running
    const renderContent = () => {
        const elements = [];
        
        // Add run state card only when actively running (not at top permanently)
        if (isRunning && runState) {
            elements.push(createElement(RunCard, { 
                key: 'runcard',
                runState, 
                isRunning, 
                onPause, 
                windowWidth, 
                settings,
                compact: true // Inline compact mode
            }));
        }

        // Render messages
        messages.forEach((m, i) => {
            const isUser = m.role === 'user';
            const isClarification = m.isClarification;
            
            elements.push(
                createElement('div', { 
                    key: m.id || `msg-${i}`, 
                    style: isUser ? userMsgStyle : agentMsgStyle 
                },
                    createElement('div', {
                        style: {
                            fontSize: isMobile ? 10 : 9,
                            color: isClarification ? '#60a5fa' : '#555',
                            marginBottom: 6,
                            fontWeight: 'bold',
                            letterSpacing: 0.8,
                            textTransform: 'uppercase'
                        }
                    }, isUser ? 'You' : (isClarification ? 'Clarification Needed' : 'Agent')),
                    createElement(MessageContent, {
                        content: m.content,
                        isUser,
                        fontSize: settings.fontSize,
                        compact: settings.compact,
                        theme: settings.theme
                    }),
                    // Show answer button for clarification messages
                    isClarification && createElement('div', {
                        style: { marginTop: 8 }
                    },
                        createElement('button', {
                            onClick: () => {
                                // Focus input or show inline answer area
                                document.querySelector('input[type=\"text\"]')?.focus();
                            },
                            style: {
                                background: '#3b82f6',
                                border: 'none',
                                borderRadius: 4,
                                padding: '4px 10px',
                                fontSize: 11,
                                color: 'white',
                                cursor: 'pointer'
                            }
                        }, 'Reply to answer...')
                    )
                )
            );

            // Inject recent logs after assistant messages when running
            if (!isUser && isRunning && runState?.logs?.length > 0 && i === messages.length - 1) {
                const recentLogs = runState.logs.slice(-5);
                recentLogs.forEach((log, li) => {
                    elements.push(renderLogEntry(log, li));
                });
            }
        });

        return elements;
    };

    return createElement('div', { style: chatAreaStyle },
        ...renderContent(),
        createElement('div', { ref: chatEndRef, style: { height: 1 } })
    );
}
