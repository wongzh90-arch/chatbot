import React, { useState, useRef, useEffect } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore.js';
import { useProviderStore } from '../stores/providerStore.js';

export function SimpleChat({ services }) {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Ready. Type `/self-improve "goal"` to start.' }
    ]);
    const [input, setInput] = useState('');
    const [tasks, setTasks] = useState([]);
    const [isRunning, setIsRunning] = useState(false);
    const [toast, setToast] = useState(null);
    const workspace = useWorkspaceStore();
    const provider = useProviderStore();
    const improverRef = useRef(null);
    const chatEndRef = useRef(null);

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const addMessage = (role, content) => setMessages(prev => [...prev, { role, content }]);
    const addToast = (msg, type = 'info') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); };

    const handleSend = async () => {
        const text = input.trim();
        if (!text) return;
        setInput('');
        addMessage('user', text);

        if (text.startsWith('/')) {
            const [cmd, ...argsArr] = text.split(' ');
            const args = argsArr.join(' ');
            if (cmd === '/self-improve') {
                if (!args) { addToast('Provide a goal', 'error'); return; }
                if (isRunning) { addToast('Already running – use /pause first', 'warning'); return; }
                setIsRunning(true);
                addMessage('assistant', `🚀 Starting self‑improvement: "${args}"`);
                improverRef.current = services.createImprover({
                    onLog: (msg) => addMessage('assistant', msg),
                    onTaskUpdate: () => { setTasks([...improverRef.current.taskQueue?.tasks] || []); },
                    onRunComplete: ({ success, prUrl }) => {
                        setIsRunning(false);
                        if (success) addMessage('assistant', `✅ PR opened: ${prUrl}`);
                        else addMessage('assistant', `❌ Self‑improvement failed.`);
                    }
                });
                await improverRef.current.fetchFileTree();
                await improverRef.current.runGoal(args);
                return;
            } else if (cmd === '/pause') {
                if (improverRef.current) improverRef.current.pause();
                addMessage('assistant', '⏸ Pause requested');
                return;
            } else if (cmd === '/help') {
                addMessage('assistant', 'Commands: `/self-improve "goal"`, `/pause`, `/clear`');
                return;
            } else if (cmd === '/clear') {
                setMessages([{ role: 'assistant', content: 'Chat cleared.' }]);
                return;
            } else {
                addMessage('assistant', `Unknown command: ${cmd}. Type /help`);
            }
            return;
        }
        addMessage('assistant', 'Please use a slash command. Type /help');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0a0a', color: '#e5e5e5' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #222', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <strong style={{ color: '#f59e0b' }}>Self‑Recursive Bot</strong>
                <input placeholder="owner/repo" value={workspace.currentRepo} onChange={e => workspace.setCurrentRepo(e.target.value)} style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, padding: '4px 8px' }} />
                <input placeholder="branch" value={workspace.currentBranch} onChange={e => workspace.setCurrentBranch(e.target.value)} style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, padding: '4px 8px' }} />
                <input type="password" placeholder="GitHub PAT" value={workspace.githubToken} onChange={e => workspace.setGithubToken(e.target.value)} style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, padding: '4px 8px' }} />
                <button onClick={() => provider.setProvider(provider.provider === 'deepseek' ? 'openrouter' : 'deepseek')} style={{ background: '#222', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>{provider.provider}</button>
                {isRunning && <span style={{ color: '#f59e0b' }}>⚙️ Running...</span>}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.map((m, i) => (
                    <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%', background: m.role === 'user' ? '#2d2d2d' : '#1e1e1e', borderRadius: 12, padding: '8px 12px' }}>
                        <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>{m.role === 'user' ? 'You' : 'Agent'}</div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                    </div>
                ))}
                <div ref={chatEndRef} />
            </div>
            {tasks.length > 0 && (
                <div style={{ borderTop: '1px solid #222', background: '#111', padding: '8px 12px', maxHeight: 150, overflowY: 'auto' }}>
                    <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 6 }}>📋 Tasks</div>
                    {tasks.map(t => (
                        <div key={t.id} style={{ fontSize: 12, display: 'flex', gap: 8, padding: '2px 0' }}>
                            <span style={{ width: 80, color: t.status === 'DONE' ? '#4ade80' : t.status === 'FAILED' ? '#f87171' : '#fbbf24' }}>{t.status}</span>
                            <span>{t.title}</span>
                        </div>
                    ))}
                </div>
            )}
            <div style={{ borderTop: '1px solid #222', padding: '12px', display: 'flex', gap: 8 }}>
                <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder="/self-improve 'add a comment'"
                    style={{ flex: 1, background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '8px 12px', color: 'white' }}
                />
                <button onClick={handleSend} style={{ background: '#f59e0b', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer' }}>Send</button>
            </div>
            {toast && <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: '#222', border: `1px solid ${toast.type === 'error' ? '#f87171' : '#4ade80'}`, borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>{toast.msg}</div>}
        </div>
    );
}
