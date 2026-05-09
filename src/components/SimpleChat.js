import React from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore.js';
import { useProviderStore } from '../stores/providerStore.js';
import { Header } from './SimpleChat/Header.js';
import { MessageList } from './SimpleChat/MessageList.js';
import { TaskList } from './SimpleChat/TaskList.js';
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

    const handleSend = async () => {
        const text = input.trim();
        if (!text) return;
        setInput('');
        addMessage('user', text);

        if (!text.startsWith('/')) {
            addMessage('assistant', 'Please use a slash command. Type /help');
            return;
        }

        const [cmd, ...argsArr] = text.split(' ');
        const args = argsArr.join(' ');

        if (cmd === '/self-improve') {
            if (!args) { addToast('Provide a goal', 'error'); return; }
            if (isRunning) { addToast('Already running – use /pause first', 'warning'); return; }
            if (!workspace.currentRepo || !workspace.githubToken) {
                addMessage('assistant', '❌ Please fill in the repository and GitHub token fields first.');
                return;
            }
            setIsRunning(true);
            addMessage('assistant', `🚀 Starting self‑improvement: "${args}"`);
            try {
                improverRef.current = services.createImprover({
                    onLog: (msg) => addMessage('assistant', msg),
                    onTaskUpdate: () => {
                        setTasks([...improverRef.current.taskQueue?.tasks] || []);
                    },
                    onRunComplete: ({ success, prUrl }) => {
                        setIsRunning(false);
                        if (success) addMessage('assistant', `✅ PR opened: ${prUrl}`);
                        else addMessage('assistant', `❌ Self‑improvement failed.`);
                    },
                    onClarificationNeeded: async (questions) => {
                        addMessage('assistant', '❓ Please answer these:\n' +
                            questions.map((q, i) => `${i + 1}. ${q}`).join('\n'));
                        return new Promise((resolve) => {
                            const answer = window.prompt(questions.join('\n'));
                            resolve(answer || '');
                        });
                    },
                });
                await improverRef.current.fetchFileTree();
                await improverRef.current.runGoal(args);
            } catch (err) {
                setIsRunning(false);
                addMessage('assistant', `❌ Startup error: ${err.message}`);
                console.error('Self-improve crash:', err);
            }
            return;
        }

        if (cmd === '/index') {
            if (isRunning) { addToast('Already running', 'warning'); return; }
            if (!workspace.currentRepo || !workspace.githubToken) {
                addMessage('assistant', '❌ Please fill in the repository and GitHub token fields first.');
                return;
            }
            setIsRunning(true);
            addMessage('assistant', '🔍 Indexing repo keywords...');
            const improver = services.createImprover({
                onLog: (msg) => addMessage('assistant', msg),
                onTaskUpdate: () => {},
                onRunComplete: () => { setIsRunning(false); },
            });
            try {
                await improver.fetchFileTree();
                await improver.buildKeywordIndex();
            } catch (err) {
                addMessage('assistant', `❌ Indexing failed: ${err.message}`);
            }
            setIsRunning(false);
            return;
        }

        if (cmd === '/pause') {
            if (improverRef.current) improverRef.current.pause();
            addMessage('assistant', '⏸ Pause requested');
            return;
        }

        if (cmd === '/help') {
            addMessage('assistant', 'Commands: `/index`, `/self-improve "goal"`, `/pause`, `/clear`');
            return;
        }

        if (cmd === '/clear') {
            setMessages([{ role: 'assistant', content: 'Chat cleared.' }]);
            return;
        }

        addMessage('assistant', `Unknown command: ${cmd}. Type /help`);
    };

    return createElement('div', {
        style: {
            display: 'flex', flexDirection: 'column', height: '100vh',
            background: '#0a0a0a', color: '#e5e5e5'
        }
    },
        createElement(Header, { isRunning, windowWidth }),
        createElement(MessageList, { messages, chatEndRef, windowWidth }),
        createElement(TaskList, { tasks, windowWidth }),
        createElement(InputBar, { input, setInput, onSend: handleSend, windowWidth }),
        createElement(Toaster, { toast })
    );
}
