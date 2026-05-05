window.ChatPane = ({
    messages, inputPrompt, setInputPrompt,
    uploadedContext, setUploadedContext,
    isLoading, onSend, onFileUpload,
    showCmdHints, onCmdHintClick,
    chatScrollRef, inputRef,
}) => {
    return React.createElement('div', { className: 'flex w-full lg:w-[400px] xl:w-[450px] flex-col bg-zinc-950 shrink-0 relative' },
        React.createElement('div', { className: 'p-3 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur z-10 shrink-0 flex justify-between' },
            React.createElement('span', { className: 'font-bold text-xs uppercase text-zinc-500' }, 'Terminal ', isLoading && React.createElement('span', { className: 'animate-pulse' }, '●'))
        ),
        React.createElement('div', { ref: chatScrollRef, className: 'flex-1 overflow-y-auto p-4 space-y-4 pb-32' },
            messages.map((m, i) =>
                React.createElement('div', { key: i, className: `flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}` },
                    React.createElement('div', { className: `max-w-[95%] p-3 rounded-lg shadow-sm border ${m.role === 'assistant' ? 'bg-zinc-900 border-zinc-800' : 'bg-amber-600/10 border-amber-500/20'}` },
                        React.createElement('div', { className: 'font-bold text-[10px] mb-2 uppercase text-zinc-500 flex items-center gap-2' },
                            React.createElement('span', null, m.role === 'assistant' ? '🤖 Agent' : '🧑 You'),
                            m.role === 'assistant' && m.model && React.createElement('span', { className: 'bg-zinc-800 rounded-full px-2 py-0.5 text-[9px] font-mono text-amber-400' }, m.model)
                        ),
                        React.createElement('div', { className: 'whitespace-pre-wrap break-words leading-relaxed text-[13px]' },
                            window.safeMarkdownToReact(m.content)
                        )
                    )
                )
            )
        ),
        // ... rest of the input area unchanged (same as before)
        React.createElement('div', { className: 'absolute bottom-0 left-0 right-0 p-3 bg-zinc-950 border-t border-zinc-900' },
            showCmdHints && React.createElement('div', { className: 'absolute bottom-full left-3 right-3 mb-2 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden z-20' },
                window.COMMANDS.filter(c => c.cmd.startsWith(inputPrompt.split(' ')[0].toLowerCase())).map((c, i) =>
                    React.createElement('div', { key: i, onClick: () => onCmdHintClick(c.cmd), className: 'px-3 py-2 border-b border-zinc-700/50 hover:bg-zinc-700 cursor-pointer flex justify-between' },
                        React.createElement('span', { className: 'font-mono text-amber-400 font-bold' }, c.cmd),
                        React.createElement('span', { className: 'text-zinc-400 text-xs' }, c.desc)
                    )
                )
            ),
            uploadedContext && React.createElement('div', { className: 'mb-2 flex items-center justify-between bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-700 text-xs w-max' },
                React.createElement('span', { className: 'truncate max-w-[200px] text-amber-400' }, '📎 ', uploadedContext.name),
                React.createElement('button', { onClick: () => setUploadedContext(null), className: 'ml-2 text-zinc-500 hover:text-red-400' }, '×')
            ),
            React.createElement('div', { className: 'flex gap-2 bg-zinc-900 p-1.5 rounded-lg border border-zinc-800 focus-within:border-amber-500/50 transition' },
                React.createElement('label', { className: 'cursor-pointer p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-amber-400' },
                    React.createElement('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
                        React.createElement('path', { d: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48' })
                    ),
                    React.createElement('input', { type: 'file', onChange: onFileUpload, className: 'hidden' })
                ),
                React.createElement('input', { ref: inputRef, type: 'text', placeholder: 'Type / for commands, or ask AI...', value: inputPrompt,
                    onChange: e => setInputPrompt(e.target.value),
                    onKeyDown: e => e.key === 'Enter' && onSend(),
                    className: 'flex-1 bg-transparent text-sm text-zinc-100 outline-none px-2 placeholder-zinc-600 font-mono'
                }),
                React.createElement('button', { onClick: onSend, disabled: isLoading || !inputPrompt.trim(), className: 'px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-zinc-950 font-bold rounded transition' }, 'Enter')
            )
        )
    );
};
