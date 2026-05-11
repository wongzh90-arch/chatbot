import React from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore.js';
import { useProviderStore } from '../stores/providerStore.js';
import { Header } from './SimpleChat/Header.js';
import { Sidebar } from './SimpleChat/Sidebar.js';
import { ChatPane } from './SimpleChat/ChatPane.js';
import { InputBar } from './SimpleChat/InputBar.js';
import { Toaster } from './SimpleChat/Toaster.js';

const { useState, useRef, useEffect, createElement } = React;

export function SimpleChat({ services }) {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Ready. Type `/self-improve "goal"` to start.' }
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
    useEffect(() => {
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

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const addMessage = (role, content) =>
        setMessages(prev => [...prev, { role, content }]);

    const addToast = (msg, type = 'info') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const updateRunState = (update) => {
        runStateRef.current = { ...(runStateRef.current || {}), ...update };
        setRunState({ ...runStateRef.current });
    };

    const dispatchPending = () => {
        if (pendingCommand) {
            const cmdToRun = pendingCommand;
            setPendingCommand(null);
            setTimeout(() => {
                addMessage('user', cmdToRun);
                handleSendText(cmdToRun);
            }, 100);
        }
    };

    const handleSendText = async (text) => {
        const [cmd, ...argsArr] = text.split(' ');
        const args = argsArr.join(' ');

        if (cmd === '/self-improve') {
            if (!args) { addToast('Provide a goal', 'error'); return; }
            if (isRunning) {
                setPendingCommand(text);
                addMessage('assistant', '⏳ Command queued – will run when current task finishes.');
                return;
            }
            if (!workspace.currentRepo || !workspace.githubToken) {
                addMessage('assistant', '❌ Please fill in the repository and GitHub token fields first.');
                return;
            }
            setIsRunning(true);
            setPendingCommand(null);

            const effectiveGoal = errorLog.trim()
                ? `[ERROR LOG]\n${errorLog.trim()}\n\nUser goal: ${args}`
                : args;
            setErrorLog('');
            setShowErrorLog(false);

            addMessage('user', text);
            setTokenPercent(null);

            runStateRef.current = {
                phase: 'clarifying',
                label: 'Starting...',
                logs: [],
                tasks: [],
                fileChanges: [],
                progress: 0
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
                });
                await improverRef.current.fetchFileTree();
                await improverRef.current.runGoal(effectiveGoal);
            } catch (err) {
                setIsRunning(false);
                addMessage('assistant', `❌ Startup error: ${err.message}`);
                console.error('Self-improve crash:', err);
                dispatchPending();
            }
            return;
        }

        if (cmd === '/index') {
            if (isRunning) {
                setPendingCommand(text);
                addMessage('assistant', '⏳ Command queued – will run when current task finishes.');
                return;
            }
            if (!workspace.currentRepo || !workspace.githubToken) {
                addMessage('assistant', '❌ Please fill in the repository and GitHub token fields first.');
                return;
            }
            setIsRunning(true);
            setPendingCommand(null);
            addMessage('user', text);

            runStateRef.current = {
                phase: 'executing',
                label: 'Indexing...',
                logs: ['🔍 Indexing repo keywords...'],
                tasks: [],
                fileChanges: [],
                progress: 0
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
            } catch (err) {
                updateRunState({
                    phase: 'failed',
                    label: 'Indexing failed',
                    logs: [...(runStateRef.current?.logs || []), `❌ ${err.message}`]
                });
            } finally {
                setIsRunning(false);
                dispatchPending();
            }
            return;
        }

        if (cmd === '/pause') {
            addMessage('user', text);
            if (improverRef.current) improverRef.current.pause();
            updateRunState({ phase: 'paused', label: 'Paused' });
            addMessage('assistant', '⏸ Pause requested');
            return;
        }

        if (cmd === '/help') {
            addMessage('user', text);
            addMessage('assistant', 'Commands: `/index`, `/self-improve "goal"`, `/pause`, `/clear`, `/context`');
            return;
        }

        if (cmd === '/clear') {
            setMessages([{ role: 'assistant', content: 'Chat cleared.' }]);
            return;
        }

        if (cmd === '/context') {
            addMessage('user', text);
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
            return;
        }

        addMessage('user', text);
        addMessage('assistant', `Unknown command: ${cmd}. Type /help`);
    };

    const handleSend = async () => {
        const text = input.trim();
        if (!text) return;
        setInput('');

        if (runStateRef.current?.phase === 'clarifying' &&
            improverRef.current?.clarificationQueue?.isPending()) {
            addMessage('user', text);
            improverRef.current.clarificationQueue.resolve(text);
            updateRunState({ phase: 'planning', label: 'Continuing...' });
            return;
        }

        addMessage('user', text);
        await handleSendText(text);
    };

    const tokenBarColor = tokenPercent !== null
        ? (tokenPercent > 60 ? '#4ade80' : tokenPercent > 30 ? '#fbbf24' : '#f87171')
        : '#333';

    return createElement('div', {
        style: { display: 'flex', flexDirection: 'row', height: '100%', background: '#0a0a0a', color: '#e5e5e5', overflow: 'hidden' }
    },
        createElement(Sidebar, { settings, setSettings, workspace, provider, runState, isRunning, windowWidth }),
        createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 } },
            createElement(Header, { isRunning, windowWidth, settings, setSettings }),
            tokenPercent !== null && createElement('div', { style: { height: 3, background: '#1a1a1a', width: '100%', flexShrink: 0 } },
                createElement('div', {
                    style: { height: '100%', width: `${tokenPercent}%`, background: tokenBarColor, transition: 'width 0.3s' }
                })
            ),
            createElement(ChatPane, {
                messages, chatEndRef, windowWidth,
                runState, isRunning,
                onPause: () => improverRef.current?.pause(),
                settings
            }),
            createElement('div', { style: { padding: '0 12px', flexShrink: 0 } },
                createElement('button', {
                    onClick: () => setShowErrorLog(!showErrorLog),
                    style: { background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }
                }, showErrorLog ? '▲ Hide error log' : '▼ Paste error log'),
                showErrorLog && createElement('textarea', {
                    value: errorLog,
                    onChange: e => setErrorLog(e.target.value),
                    placeholder: 'Paste stack trace or error message here...',
                    rows: 3,
                    style: { width: '100%', background: '#111', border: '1px solid #222', borderRadius: 6, padding: 8, color: 'white', fontSize: 12, resize: 'vertical', marginBottom: 8 }
                })
            ),
            createElement(InputBar, { input, setInput, onSend: handleSend, windowWidth, settings }),
            createElement(Toaster, { toast })
        )
    );
}
