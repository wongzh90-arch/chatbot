// js/components/LeftPane.jsx
// Updated Phase 1C: reads tasks from TaskQueue state

window.LeftPane = ({ memory, fileTree, activeFilePath, onFileClick, orchestratorTasks, isRunActive, isLoading, onFetchFileTree }) => {
  // Derive tasks from TaskQueue if available, otherwise fallback to prop
  const tasks = window.TaskQueue ? window.TaskQueue.getAllTasks() : orchestratorTasks || [];

  return React.createElement('div', { className: 'flex w-full lg:w-64 bg-zinc-950/50 border-r border-zinc-900 flex-col h-full shrink-0' },

    // Memory section
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

    // Tasks section (visible when run active)
    isRunActive && React.createElement('div', { className: 'flex-1 border-b border-zinc-900 flex flex-col min-h-0' },
      React.createElement('div', { className: 'p-2 border-b border-zinc-900 bg-zinc-900/50 font-bold text-[10px] uppercase text-green-400' }, '📋 Tasks'),
      React.createElement('div', { className: 'p-2 overflow-y-auto flex-1 text-xs' },
        tasks.length === 0
          ? React.createElement('p', { className: 'text-zinc-600' }, 'No tasks yet.')
          : React.createElement('ul', { className: 'space-y-1' },
              tasks.map(t => {
                const statusColor =
                  t.status === 'DONE' ? 'text-green-400' :
                  t.status === 'IN_PROGRESS' ? 'text-amber-400' :
                  t.status === 'REVIEW' ? 'text-purple-400' :
                  t.status === 'FAILED' || t.status === 'BLOCKED' ? 'text-red-400' :
                  'text-zinc-500';
                return React.createElement('li', { key: t.id, className: 'flex items-start gap-1 py-0.5' },
                  React.createElement('span', { className: `${statusColor} text-[10px] mt-0.5` }, '●'),
                  React.createElement('span', { className: 'text-zinc-300 truncate' }, t.title),
                  t.files && t.files.length > 0 && React.createElement('span', { className: 'text-[9px] text-zinc-600 ml-auto' }, t.files[0].split('/').pop())
                );
              })
            )
      )
    ),

    // File tree section
    React.createElement('div', { className: 'flex-[2] flex flex-col min-h-0' },
      React.createElement('div', { className: 'p-2 border-b border-zinc-900 bg-zinc-900/50 font-bold text-[10px] uppercase text-blue-400 flex items-center justify-between' },
        '📁 Workspace',
        React.createElement('button', {
          onClick: onFetchFileTree,
          disabled: isLoading,
          className: 'text-[9px] text-zinc-500 hover:text-zinc-300 disabled:opacity-30'
        }, isLoading ? '⟳' : '↻')
      ),
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
