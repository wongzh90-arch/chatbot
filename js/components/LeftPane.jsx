window.LeftPane = ({ memory, fileTree, activeFilePath, onFileClick }) => {
    return React.createElement('div', { className: 'flex w-full lg:w-64 bg-zinc-950/50 border-r border-zinc-900 flex-col h-full shrink-0' },
        React.createElement('div', { className: 'flex-1 border-b border-zinc-900 flex flex-col min-h-0' },
            React.createElement('div', { className: 'p-2 border-b border-zinc-900 bg-zinc-900/50 font-bold text-[10px] uppercase text-amber-500' }, '🧠 Memory'),
            React.createElement('div', { className: 'p-2 overflow-y-auto flex-1 text-xs' },
                memory.length === 0
                    ? React.createElement('p', { className: 'text-zinc-600 italic' }, 'No rules. Type /learn.')
                    : React.createElement('ul', { className: 'space-y-2' },
                        memory.map((m, i) =>
                            React.createElement('li', { key: i, className: 'bg-zinc-900 p-2 rounded border border-zinc-800' },
                                React.createElement('span', { className: 'text-amber-500' }, '•'), ' ', m
                            )
                        )
                    )
            )
        ),
        React.createElement('div', { className: 'flex-[2] flex flex-col min-h-0' },
            React.createElement('div', { className: 'p-2 border-b border-zinc-900 bg-zinc-900/50 font-bold text-[10px] uppercase text-blue-400' }, '📁 Workspace'),
            React.createElement('div', { className: 'p-2 overflow-y-auto flex-1 text-xs' },
                fileTree.length === 0
                    ? React.createElement('p', { className: 'text-zinc-600' }, 'No files loaded.')
                    : React.createElement('ul', { className: 'space-y-0.5 font-mono' },
                        fileTree.map(f =>
                            React.createElement('li', { key: f.path, onClick: () => onFileClick(f.path),
                                className: `cursor-pointer px-2 py-1 rounded truncate ${activeFilePath===f.path?'bg-zinc-800 text-blue-400 font-bold':'text-zinc-400 hover:bg-zinc-800/50'}`
                            },
                                f.path.split('/').pop(),
                                React.createElement('span', { className: 'text-[9px] text-zinc-600 block truncate' }, f.path)
                            )
                        )
                    )
            )
        )
    );
};
