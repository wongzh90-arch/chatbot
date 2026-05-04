window.EditorPane = ({ filePath, content, onChange, onCommit, isLoading, activeRepo, activeBranch }) => {
    return React.createElement('div', { className: 'flex flex-1 flex-col border-r border-zinc-900 min-w-0 bg-[#0d0d0d]' },
        React.createElement('div', { className: 'flex justify-between items-center p-2 border-b border-zinc-900 bg-zinc-950 shrink-0' },
            React.createElement('span', { className: 'font-mono text-xs text-zinc-400 truncate px-2' }, filePath ? `${activeRepo}/${activeBranch}/${filePath}` : 'No file'),
            React.createElement('button', { onClick: onCommit, disabled: isLoading || !filePath, className: 'px-4 py-1 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-500 font-bold text-xs text-zinc-950 rounded transition' }, 'Commit')
        ),
        React.createElement('textarea', { value: content, onChange: e => onChange(e.target.value), spellCheck: 'false', className: 'flex-1 w-full p-4 font-mono text-[13px] leading-relaxed bg-transparent text-zinc-300 outline-none resize-none overflow-y-auto custom-scrollbar' })
    );
};
