import React from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore.js';
import { useProviderStore } from '../stores/providerStore.js';
import { Header } from './SimpleChat/Header.js';
import { ChatPane } from './SimpleChat/ChatPane.js';
import { InputBar } from './SimpleChat/InputBar.js';
import { Toaster } from './SimpleChat/Toaster.js';

const { useState, useRef, useEffect, createElement } = React;

export function SimpleChat({ services }) {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Ready. Type `/self-improve "goal"` to start.' }
    ]);
    const [input, setInput] = useState('');
    const [tasks, setTasks] = useState([]);
    const [isRunning, setIsRunning] = useState(false);
    const [toast, setToast] = useState(null);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [pendingCommand, setPendingCommand] = useState(null);

    // ── Live run state (for RunCard) ──
    const [runState, setRunState] = useState(null);
    const runStateRef = useRef(null);

    // ── Error log state ──
    const [errorLog, setErrorLog] = useState('');
    const [showErrorLog, setShowErrorLog] = useState(false);

    // ── Token budget ──
    const [tokenPercent, setTokenPercent] = useState(null);

    // ── Clarification queue reference ──
    const clarificationQueueRef = useRef(null);

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
        // ── If clarification is pending, route as answer ──
        if (clarificationQueueRef.current?.isPending()) {
            addMessage('user', text);
            clarificationQueueRef.current.resolve(text);
            updateRunState({ phase: 'planning', label: 'Continuing...' });
            return;
        }

        const [cmd, ...argsArr] = text.split(' ');
        const args = argsArr.join(' ');

        // ─── SELF‑IMPROVE ───
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
                        setTasks([...t]);
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
                    onClarificationNeeded: async (questions) => {
                        // Show questions as an assistant chat bubble
                        addMessage('assistant', '❓ Please answer these:\n' +
                            questions.map((q, i) => `${i + 1}. ${q}`).join('\n'));

                        updateRunState({
                            phase: 'clarifying',
                            label: 'Awaiting answers...'
                        });

                        // Return a promise that the UI resolves when the user replies
                        return new Promise((resolve) => {
                            if (improverRef.current?.clarificationQueue) {
                                improverRef.current.clarificationQueue._pendingResolve = resolve;
                                clarificationQueueRef.current = improverRef.current.clarificationQueue;
                            } else {
                                // Fallback: window.prompt
                                const answer = window.prompt(questions.join('\n'));
                                resolve(answer || '');
                            }
                        });
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

        // ─── INDEX ───
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
                onProgress: (pct) => updateRunState({ progress: pct })
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

        // ─── PAUSE ───
        if (cmd === '/pause') {
            addMessage('user', text);
            if (improverRef.current) improverRef.current.pause();
            updateRunState({ phase: 'paused', label: 'Paused' });
            addMessage('assistant', '⏸ Pause requested');
            return;
        }

        // ─── HELP ───
        if (cmd === '/help') {
            addMessage('user', text);
            addMessage('assistant', 'Commands: `/index`, `/self-improve "goal"`, `/pause`, `/clear`, `/context`');
            return;
        }

        // ─── CLEAR ───
        if (cmd === '/clear') {
            setMessages([{ role: 'assistant', content: 'Chat cleared.' }]);
            return;
        }

        // ─── CONTEXT ───
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

        // ─── UNKNOWN ───
        addMessage('user', text);
        addMessage('assistant', `Unknown command: ${cmd}. Type /help`);
    };

    const handleSend = async () => {
        const text = input.trim();
        if (!text) return;
        setInput('');
        await handleSendText(text);
    };

    const tokenBarColor = tokenPercent !== null
        ? (tokenPercent > 60 ? '#4ade80' : tokenPercent > 30 ? '#fbbf24' : '#f87171')
        : '#333';

    return createElement('div', {
        style: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0a0a', color: '#e5e5e5' }
    },
        createElement(Header, { isRunning, windowWidth }),
        tokenPercent !== null && createElement('div', { style: { height: 4, background: '#1a1a1a', width: '100%' } },
            createElement('div', {
                style: { height: '100%', width: `${tokenPercent}%`, background: tokenBarColor, transition: 'width 0.3s' }
            })
        ),
        createElement(ChatPane, {
            messages, chatEndRef, windowWidth,
            runState, isRunning,
            onPause: () => improverRef.current?.pause()
        }),
        createElement('div', { style: { padding: '0 12px' } },
            createElement('button', {
                onClick: () => setShowErrorLog(!showErrorLog),
                style: { background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 12, marginBottom: 4 }
            }, showErrorLog ? '▲ Hide error log' : '▼ Paste error log'),
            showErrorLog && createElement('textarea', {
                value: errorLog,
                onChange: e => setErrorLog(e.target.value),
                placeholder: 'Paste stack trace or error message here...',
                rows: 4,
                style: { width: '100%', background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, padding: 8, color: 'white', fontSize: 13, resize: 'vertical', marginBottom: 8 }
            })
        ),
        createElement(InputBar, { input, setInput, onSend: handleSend, windowWidth }),
        createElement(Toaster, { toast })
    );
}
