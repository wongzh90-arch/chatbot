import React from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore.js';
import { useProviderStore } from '../stores/providerStore.js';
import { Header } from './SimpleChat/Header.js';
import { Sidebar } from './SimpleChat/Sidebar.js';
import { ChatPane } from './SimpleChat/ChatPane.js';
import { InputBar } from './SimpleChat/InputBar.js';
import { Toaster } from './SimpleChat/Toaster.js';
import { MessageContent } from './SimpleChat/MessageContent.js';

const { useState, useRef, useEffect, createElement, useCallback } = React;

export function SimpleChat({ services }) {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Ready. Type `/self-improve "goal"` to start.', id: 'init-0' }
    ]);
    const [input, setInput] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [toast, setToast] = useState(null);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [pendingCommand, setPendingCommand] = useState(null);

    // ── Settings & sidebar ──
    const [settings, setSettings] = useState(() => {
        try {
            const raw = localStorage.getItem('srb-settings');
            return raw ? JSON.parse(raw) : { theme: 'dark', fontSize: 'md', compact: false, sidebarOpen: true };
        } catch {
            return { theme: 'dark', fontSize: 'md', compact: false, sidebarOpen: true };
        }
    });
    
    // Apply theme to document body
    useEffect(() => {
        document.body.classList.remove('theme-dark', 'theme-light');
        document.body.classList.add(`theme-${settings.theme}`);
        document.body.style.background = settings.theme === 'dark' ? '#0a0a0a' : '#f5f5f5';
        document.body.style.color = settings.theme === 'dark' ? '#e5e5e5' : '#1a1a1a';
        localStorage.setItem('srb-settings', JSON.stringify(settings));
    }, [settings]);

    // ── Live run state ──
    const [runState, setRunState] = useState(null);
    const runStateRef = useRef(null);

    // ── Error log ──
    const [errorLog, setErrorLog] = useState('');
    const [showErrorLog, setShowErrorLog] = useState(false);

    // ── Token budget ──
    const [tokenPercent, setTokenPercent] = useState(null);

    const workspace = useWorkspaceStore();
    const provider = useProviderStore();
    const improverRef = useRef(null);
    const chatEndRef = useRef(null);
    const isProcessingRef = useRef(false); // Prevent duplicate sends

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const addMessage = useCallback((role, content, extra = {}) => {
        const id = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setMessages(prev => [...prev, { role, content, id, ...extra }]);
    }, []);

    const addToast = useCallback((msg, type = 'info') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    }, []);

    const updateRunState = useCallback((update) => {
        runStateRef.current = { ...(runStateRef.current || {}), ...update };
        setRunState({ ...runStateRef.current });
    }, []);

    const dispatchPending = useCallback(() => {
        if (pendingCommand) {
            const cmdToRun = pendingCommand;
            setPendingCommand(null);
            setTimeout(() => {
                handleSendText(cmdToRun, false); // false = don't add to messages again
            }, 100);
        }
    }, [pendingCommand]);

    const handleSendText = useCallback(async (text, shouldAddToMessages = true) => {
        // Prevent duplicate processing
        if (isProcessingRef.current) {
            setPendingCommand(text);
            addToast('Command queued', 'info');
            return;
        }
        isProcessingRef.current = true;

        const [cmd, ...argsArr] = text.split(' ');
        const args = argsArr.join(' ');

        if (shouldAddToMessages) {
            addMessage('user', text);
        }

        if (cmd === '/self-improve') {
            if (!args) { 
                addToast('Provide a goal', 'error'); 
                isProcessingRef.current = false;
                return; 
            }
            if (isRunning) {
                setPendingCommand(text);
                addMessage('assistant', '⏳ Command queued – will run when current task finishes.');
                isProcessingRef.current = false;
                return;
            }
            if (!workspace.currentRepo || !workspace.githubToken) {
                addMessage('assistant', '❌ Please fill in the repository and GitHub token fields first.');
                isProcessingRef.current = false;
                return;
            }
            setIsRunning(true);
            setPendingCommand(null);

            const effectiveGoal = errorLog.trim()
                ? `[ERROR LOG]\n${errorLog.trim()}\n\nUser goal: ${args}`
                : args;
            setErrorLog('');
            setShowErrorLog(false);

            setTokenPercent(null);

            runStateRef.current = {
                phase: 'clarifying',
                label: 'Starting...',
                logs: [],
                tasks: [],
                fileChanges: [],
                progress: 0,
                id: `run-${Date.now()}`
            };
            setRunState({ ...runStateRef.current });

            try {
                improverRef.current = services.createImprover({
                    onLog: (msg) => {
                        const logs = [...(runStateRef.current?.logs || []), msg];
                        updateRunState({ logs: logs.slice(-100) });
                    },
                    onTaskUpdate: () => {
                        const t = improverRef.current?.taskQueue?.tasks || [];
                        const done = t.filter(t => t.status === 'DONE').length;
                        const failed = t.filter(t => t.status === 'FAILED').length;
                        const total = t.length;
                        updateRunState({
                            tasks: t.map(t => ({ title: t.title, status: t.status })),
                            progress: total > 0 ? ((done + failed) / total) * 100 : 0
                        });
                    },
                    onRunComplete: ({ success, prUrl }) => {
                        setIsRunning(false);
                        setTokenPercent(null);
                        updateRunState({
                            phase: success ? 'done' : 'failed',
                            label: success ? 'PR Ready' : 'Run failed',
                            progress: 100
                        });
                        if (success) addMessage('assistant', `✅ PR opened: ${prUrl}`);
                        else addMessage('assistant', `❌ Self‑improvement failed.`);
                        isProcessingRef.current = false;
                        dispatchPending();
                    },
                    onTokenUpdate: (used, budget) => {
                        if (budget) setTokenPercent(Math.min(100, Math.round((used / budget) * 100)));
                    },
                    onPhaseChange: (phase, label) => updateRunState({ phase, label }),
                    onFileChange: (path, status, diff) => {
                        const fc = [...(runStateRef.current?.fileChanges || [])];
                        const idx = fc.findIndex(f => f.path === path);
                        if (idx >= 0) fc[idx] = { path, status, diff };
                        else fc.push({ path, status, diff });
                        updateRunState({ fileChanges: fc });
                    },
                    onClarificationNeeded: (questions) => {
                        // Add clarification questions as a chat message
                        const questionText = '❓ I need some clarification before proceeding:\n\n' +
                            questions.map((q, i) => `${i + 1}. ${q}`).join('\n') +
                            '\n\nPlease reply with your answers.';
                        addMessage('assistant', questionText, { isClarification: true, questions });
                        updateRunState({ phase: 'clarifying', label: 'Awaiting your answers...' });
                    },
                });
                await improverRef.current.fetchFileTree();
                await improverRef.current.runGoal(effectiveGoal);
            } catch (err) {
                setIsRunning(false);
                addMessage('assistant', `❌ Error: ${err.message}`);
                console.error('Self-improve crash:', err);
                isProcessingRef.current = false;
                dispatchPending();
            }
            return;
        }

        if (cmd === '/index') {
            if (isRunning) {
                setPendingCommand(text);
                addMessage('assistant', '⏳ Command queued – will run when current task finishes.');
                isProcessingRef.current = false;
                return;
            }
            if (!workspace.currentRepo || !workspace.githubToken) {
                addMessage('assistant', '❌ Please fill in the repository and GitHub token fields first.');
                isProcessingRef.current = false;
                return;
            }
            setIsRunning(true);
            setPendingCommand(null);

            runStateRef.current = {
                phase: 'executing',
                label: 'Indexing...',
                logs: ['🔍 Indexing repo keywords...'],
                tasks: [],
                fileChanges: [],
                progress: 0,
                id: `index-${Date.now()}`
            };
            setRunState({ ...runStateRef.current });

            const improver = services.createImprover({
                onLog: (msg) => {
                    const logs = [...(runStateRef.current?.logs || []), msg];
                    updateRunState({ logs: logs.slice(-100) });
                },
                onTaskUpdate: () => {},
                onTokenUpdate: () => {},
            });

            try {
                await improver.fetchFileTree();
                await improver.buildKeywordIndex();
                updateRunState({
                    phase: 'done',
                    label: 'Indexed',
                    progress: 100,
                    logs: [...(runStateRef.current?.logs || []), '✅ Indexed']
                });
                addMessage('assistant', '✅ Repository indexed successfully.');
            } catch (err) {
                updateRunState({
                    phase: 'failed',
                    label: 'Indexing failed',
                    logs: [...(runStateRef.current?.logs || []), `❌ ${err.message}`]
                });
                addMessage('assistant', `❌ Indexing failed: ${err.message}`);
            } finally {
                setIsRunning(false);
                isProcessingRef.current = false;
                dispatchPending();
            }
            return;
        }

        if (cmd === '/pause') {
            if (improverRef.current) improverRef.current.pause();
            updateRunState({ phase: 'paused', label: 'Paused' });
            addMessage('assistant', '⏸ Pause requested');
            isProcessingRef.current = false;
            return;
        }

        if (cmd === '/help') {
            addMessage('assistant', 'Commands: `/index`, `/self-improve "goal"`, `/pause`, `/clear`, `/context`');
            isProcessingRef.current = false;
            return;
        }

        if (cmd === '/clear') {
            setMessages([{ role: 'assistant', content: 'Chat cleared.', id: 'clear-0' }]);
            isProcessingRef.current = false;
            return;
        }

        if (cmd === '/context') {
            const improver = services.createImprover({
                onLog: () => {},
                onTaskUpdate: () => {},
                onTokenUpdate: () => {},
            });
            if (improver.conversationMemory) {
                const summary = improver.conversationMemory.toSummaryString();
                addMessage('assistant', summary || 'No memory yet.');
            } else {
                addMessage('assistant', 'No conversation memory available.');
            }
            isProcessingRef.current = false;
            return;
        }

        addMessage('assistant', `Unknown command: ${cmd}. Type /help`);
        isProcessingRef.current = false;
    }, [isRunning, workspace, errorLog, addMessage, addToast, updateRunState, dispatchPending, services]);

    const handleSend = useCallback(async () => {
        const text = input.trim();
        if (!text) return;
        setInput('');

        // Check if we're in clarification mode
        if (improverRef.current?.clarificationQueue?.isPending()) {
            addMessage('user', text);
            improverRef.current.clarificationQueue.resolve(text);
            updateRunState({ phase: 'planning', label: 'Continuing...' });
            return;
        }

        await handleSendText(text, true);
    }, [input, addMessage, updateRunState, handleSendText]);

    const tokenBarColor = tokenPercent !== null
        ? (tokenPercent > 60 ? '#4ade80' : tokenPercent > 30 ? '#fbbf24' : '#f87171')
        : '#333';

    return createElement('div', {
        style: { 
            display: 'flex', 
            flexDirection: 'row', 
            height: '100%', 
            background: settings.theme === 'dark' ? '#0a0a0a' : '#f5f5f5', 
            color: settings.theme === 'dark' ? '#e5e5e5' : '#1a1a1a',
            overflow: 'hidden' 
        }
    },
        createElement(Sidebar, { settings, setSettings, workspace, provider, runState, isRunning, windowWidth }),
        createElement('div', { 
            style: { 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                overflow: 'hidden', 
                minWidth: 0,
                background: settings.theme === 'dark' ? '#0a0a0a' : '#f5f5f5',
            } 
        },
            createElement(Header, { isRunning, windowWidth, settings, setSettings }),
            tokenPercent !== null && createElement('div', { 
                style: { height: 3, background: '#1a1a1a', width: '100%', flexShrink: 0 } 
            },
                createElement('div', {
                    style: { height: '100%', width: `${tokenPercent}%`, background: tokenBarColor, transition: 'width 0.3s' }
                })
            ),
            createElement(ChatPane, {
                messages, 
                chatEndRef, 
                windowWidth,
                runState, 
                isRunning,
                onPause: () => improverRef.current?.pause(),
                settings,
                onSend: handleSendText
            }),
            createElement('div', { style: { padding: '0 12px', flexShrink: 0 } },
                createElement('button', {
                    onClick: () => setShowErrorLog(!showErrorLog),
                    style: { 
                        background: 'none', 
                        border: 'none', 
                        color: '#555', 
                        cursor: 'pointer', 
                        fontSize: 11, 
                        marginBottom: 4, 
                        textTransform: 'uppercase', 
                        letterSpacing: 0.5 
                    }
                }, showErrorLog ? '▲ Hide error log' : '▼ Paste error log'),
                showErrorLog && createElement('textarea', {
                    value: errorLog,
                    onChange: e => setErrorLog(e.target.value),
                    placeholder: 'Paste stack trace or error message here...',
                    rows: 3,
                    style: { 
                        width: '100%', 
                        background: settings.theme === 'dark' ? '#111' : '#fff', 
                        border: '1px solid #222', 
                        borderRadius: 6, 
                        padding: 8, 
                        color: settings.theme === 'dark' ? 'white' : '#1a1a1a', 
                        fontSize: 12, 
                        resize: 'vertical', 
                        marginBottom: 8 
                    }
                })
            ),
            createElement(InputBar, { input, setInput, onSend: handleSend, windowWidth, settings }),
            createElement(Toaster, { toast })
        )
    );
}
