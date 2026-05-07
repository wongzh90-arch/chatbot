// js/components/LeftPane.jsx
// Updated: added theme support
window.LeftPane = ({ theme, memory, fileTree, activeFilePath, onFileClick, orchestratorTasks, isRunActive, isLoading, onFetchFileTree }) => {
  const tasks = window.TaskQueue ? window.TaskQueue.getAllTasks() : orchestratorTasks || [];

  // Theme‑aware classes
  const panelBg = theme === 'dark' ? 'bg-zinc-950/50 border-zinc-900' : 'bg-gray-50 border-gray-200';
  const sectionBorder = theme === 'dark' ? 'border-zinc-900' : 'border-gray-200';
  const sectionHeaderBg = theme === 'dark' ? 'bg-zinc-900/50' : 'bg-gray-100';
  const textPrimary = theme === 'dark' ? 'text-zinc-300' : 'text-gray-800';
  const textMuted = theme === 'dark' ? 'text-zinc-600' : 'text-gray-400';
  const cardBg = theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200 shadow-sm';
  const hoverBg = theme === 'dark' ? 'hover:bg-zinc-800/50' : 'hover:bg-gray-100';
  const activeBg = theme === 'dark' ? 'bg-zinc-800 text-blue-400' : 'bg-blue-50 text-blue-600';
  const statusColors = {
    DONE: theme === 'dark' ? 'text-green-400' : 'text-green-600',
    IN_PROGRESS: 'text-amber-400',
    REVIEW: 'text-purple-400',
    FAILED: 'text-red-400',
    BLOCKED: 'text-red-400',
  };

  return React.createElement('div', {
    className: `flex w-full lg:w-64 ${panelBg} border-r flex-col h-full shrink-0`
  },
    // Memory section
    React.createElement('div', { className: `flex-1 border-b ${sectionBorder} flex flex-col min-h-0` },
      React.createElement('div', { className: `p-2 border-b ${sectionBorder} ${sectionHeaderBg} font-bold text-[10px] uppercase text-amber-500` }, '🧠 Memory'),
      React.createElement('div', { className: `p-2 overflow-y-auto flex-1 text-xs` },
        memory.length === 0
          ? React.createElement('p', { className: `${textMuted} italic` }, 'No rules. Type /learn.')
          : React.createElement('ul', { className: 'space-y-2' },
              memory.map((m, i) =>
                React.createElement('li', { key: i, className: `${cardBg} p-2 rounded border` },
                  React.createElement('span', { className: 'text-amber-500' }, '•'), ' ', m
                )
              )
            )
      )
    ),
    // Tasks section (only when run active)
    isRunActive && React.createElement('div', { className: `flex-1 border-b ${sectionBorder} flex flex-col min-h-0` },
      React.createElement('div', { className: `p-2 border-b ${sectionBorder} ${sectionHeaderBg} font-bold text-[10px] uppercase text-green-400` }, '📋 Tasks'),
      React.createElement('div', { className: `p-2 overflow-y-auto flex-1 text-xs` },
        tasks.length === 0
          ? React.createElement('p', { className: textMuted }, 'No tasks yet.')
          : React.createElement('ul', { className: 'space-y-1' },
              tasks.map(t => {
                const statusColor = statusColors[t.status] || textMuted;
                return React.createElement('li', { key: t.id, className: 'flex items-start gap-1 py-0.5' },
                  React.createElement('span', { className: `${statusColor} text-[10px] mt-0.5` }, '●'),
                  React.createElement('span', { className: `${textPrimary} truncate` }, t.title),
                  t.files && t.files.length > 0 && React.createElement('span', { className: 'text-[9px] text-zinc-600 ml-auto' }, t.files[0].split('/').pop())
                );
              })
            )
      )
    ),
    // File tree section
    React.createElement('div', { className: 'flex-[2] flex flex-col min-h-0' },
      React.createElement('div', { className: `p-2 border-b ${sectionBorder} ${sectionHeaderBg} font-bold text-[10px] uppercase text-blue-400 flex items-center justify-between` },
        '📁 Workspace',
        React.createElement('button', {
          onClick: onFetchFileTree,
          disabled: isLoading,
          className: `text-[9px] ${textMuted} hover:text-zinc-300 disabled:opacity-30`
        }, isLoading ? '⟳' : '↻')
      ),
      React.createElement('div', { className: `p-2 overflow-y-auto flex-1 text-xs` },
        fileTree.length === 0
          ? React.createElement('p', { className: textMuted }, 'No files loaded.')
          : React.createElement('ul', { className: 'space-y-0.5 font-mono' },
              fileTree.map(f =>
                React.createElement('li', {
                  key: f.path,
                  onClick: () => onFileClick(f.path),
                  className: `cursor-pointer px-2 py-1 rounded truncate ${activeFilePath === f.path ? activeBg : `${textMuted} ${hoverBg}`}`
                },
                  f.path.split('/').pop(),
                  React.createElement('span', { className: `text-[9px] ${textMuted} block truncate` }, f.path)
                )
              )
            )
      )
    )
  );
};
