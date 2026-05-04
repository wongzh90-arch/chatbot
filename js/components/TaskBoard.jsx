window.TaskBoard = ({ tasks, onRefresh, isLoading }) => {
    if (!tasks || tasks.length === 0) {
        return React.createElement('div', { className: 'flex-1 flex items-center justify-center text-zinc-500 text-sm' },
            React.createElement('div', { className: 'text-center' },
                React.createElement('div', { className: 'text-4xl mb-2' }, '📋'),
                React.createElement('p', null, 'No tasks yet.'),
                React.createElement('p', { className: 'text-xs mt-1' }, 'Use /plan to create a task list.')
            )
        );
    }

    const columns = [
        { key: 'task:todo',        title: '📝 TODO',         color: 'border-zinc-600' },
        { key: 'task:in_progress', title: '🔨 IN PROGRESS',  color: 'border-orange-500' },
        { key: 'task:review',      title: '🔍 REVIEW',       color: 'border-yellow-500' },
        { key: 'task:done',        title: '✅ DONE',          color: 'border-green-500' },
    ];

    const getStatus = (task) => {
        for (const col of columns) {
            if (task.labels.some(l => l.name === col.key)) return col.key;
        }
        return 'task:todo';
    };

    const tasksByStatus = {};
    for (const col of columns) { tasksByStatus[col.key] = []; }
    for (const task of tasks) {
        const status = getStatus(task);
        if (tasksByStatus[status]) tasksByStatus[status].push(task);
    }

    return React.createElement('div', { className: 'flex-1 flex flex-col bg-zinc-950' },
        React.createElement('div', { className: 'p-2 border-b border-zinc-900 flex justify-between items-center' },
            React.createElement('span', { className: 'font-bold text-[10px] uppercase text-zinc-500' }, '📋 Task Board'),
            React.createElement('button', { onClick: onRefresh, disabled: isLoading, className: 'text-xs text-zinc-500 hover:text-zinc-300' },
                isLoading ? '⟳' : '↻ Refresh'
            )
        ),
        React.createElement('div', { className: 'flex-1 flex overflow-x-auto gap-0' },
            columns.map(col =>
                React.createElement('div', { key: col.key, className: `flex-1 min-w-[160px] border-r border-zinc-900 ${col.color} border-t-2` },
                    React.createElement('div', { className: 'p-2 font-bold text-[10px] uppercase text-zinc-400 bg-zinc-900/50 sticky top-0' },
                        `${col.title} (${tasksByStatus[col.key].length})`
                    ),
                    React.createElement('div', { className: 'p-2 space-y-2 overflow-y-auto' },
                        tasksByStatus[col.key].map(task =>
                            React.createElement('div', { key: task.number, className: 'bg-zinc-900 border border-zinc-800 rounded p-2 text-xs' },
                                React.createElement('div', { className: 'font-bold text-zinc-300 mb-1' }, `#${task.number} ${task.title}`),
                                task.labels.filter(l => l.name.startsWith('task:')).map(l =>
                                    React.createElement('span', { key: l.name, className: 'inline-block px-1 py-0.5 rounded text-[10px] mr-1', style: { backgroundColor: `#${l.color}33`, color: `#${l.color}` } },
                                        l.name.replace('task:', '')
                                    )
                                ),
                                React.createElement('a', { href: task.html_url, target: '_blank', rel: 'noopener noreferrer', className: 'block mt-1 text-blue-400 hover:underline text-[10px]' }, 'View on GitHub ↗')
                            )
                        )
                    )
                )
            )
        )
    );
};
