// js/components/LeftPane.jsx
// Three sections:
//   1. File tree (collapsible folders, click to open inline)
//   2. Memory rules
//   3. Task strip (only when run active)

window.LeftPane = ({
  fileTree,
  onFileClick,
  recentlyModified,
  memory,
  orchestratorTasks,
  isRunActive,
  isLoading,
  onFetchFileTree,
}) => {
  const { useState, useMemo } = React;
  const [collapsed, setCollapsed] = useState({});  // { [dirPath]: bool }
  const [showMemory, setShowMemory] = useState(true);

  // ── Build folder tree from flat file list ─────────────────────
  const tree = useMemo(() => {
    if (!fileTree || fileTree.length === 0) return [];

    // Build a nested node structure
    const root = { name: '', children: {}, files: [] };

    fileTree.forEach(file => {
      const parts = file.path.split('/');
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const dir = parts[i];
        if (!node.children[dir]) {
          node.children[dir] = { name: dir, children: {}, files: [], path: parts.slice(0, i + 1).join('/') };
        }
        node = node.children[dir];
      }
      node.files.push({ name: parts[parts.length - 1], path: file.path });
    });

    return root;
  }, [fileTree]);

  const toggleDir = (path) => {
    setCollapsed(prev => ({ ...prev, [path]: !prev[path] }));
  };

  // ── Recursive tree renderer ───────────────────────────────────
  const renderNode = (node, depth = 0) => {
    const indent = depth * 10;
    const dirs   = Object.values(node.children || {}).sort((a, b) => a.name.localeCompare(b.name));
    const files  = (node.files || []).sort((a, b) => a.name.localeCompare(b.name));

    return React.createElement(React.Fragment, null,
      // Directories first
      dirs.map(dir => {
        const isOpen = !collapsed[dir.path];
        return React.createElement(React.Fragment, { key: dir.path },
          // Dir row
          React.createElement('div', {
            onClick: () => toggleDir(dir.path),
            style: { paddingLeft: indent + 8 },
            className: 'flex items-center gap-1 py-0.5 px-1 cursor-pointer hover:bg-zinc-800/60 rounded text-zinc-400 hover:text-zinc-200 transition-colors select-none'
          },
            React.createElement('span', {
              className: 'text-[10px] text-zinc-600 w-3 shrink-0 transition-transform',
              style: { transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }
            }, '▶'),
            React.createElement('span', { className: 'text-zinc-500 text-[11px] mr-0.5' }, '📁'),
            React.createElement('span', { className: 'text-[11px] truncate' }, dir.name)
          ),
          // Children (if open)
          isOpen && renderNode(dir, depth + 1)
        );
      }),
      // Files
      files.map(file => {
        const isModified = recentlyModified && recentlyModified.has(file.path);
        const ext = file.name.split('.').pop();
        const icon = ext === 'jsx' ? '⚛' : ext === 'js' ? '𝒿' : ext === 'json' ? '{}' : ext === 'html' ? '🌐' : ext === 'md' ? '📝' : '·';
        return React.createElement('div', {
          key: file.path,
          onClick: () => onFileClick && onFileClick(file.path),
          style: { paddingLeft: indent + 8 },
          className: 'group flex items-center gap-1.5 py-0.5 px-1 cursor-pointer hover:bg-zinc-800/60 rounded transition-colors'
        },
          React.createElement('span', {
            className: 'text-[10px] text-zinc-600 w-3 shrink-0 font-mono'
          }, icon),
          React.createElement('span', {
            className: `text-[11px] truncate flex-1 ${isModified ? 'text-amber-400' : 'text-zinc-400 group-hover:text-zinc-200'}`
          }, file.name),
          isModified && React.createElement('span', {
            className: 'w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0',
            title: 'Modified this session'
          })
        );
      })
    );
  };

  // ── Task status meta ──────────────────────────────────────────
  const TASK_STATUS = {
    'task:todo':        { label: 'Todo',    dot: 'bg-zinc-500' },
    'task:in_progress': { label: 'Running', dot: 'bg-amber-400 animate-pulse' },
    'task:review':      { label: 'Review',  dot: 'bg-yellow-400' },
    'task:done':        { label: 'Done',    dot: 'bg-green-500' },
    'task:blocked':     { label: 'Blocked', dot: 'bg-red-500' },
  };

  const getStatus = (task) => {
    for (const key of Object.keys(TASK_STATUS)) {
      if (task.labels && task.labels.some(l => l.name === key)) return TASK_STATUS[key];
    }
    return TASK_STATUS['task:todo'];
  };

  // ── Render ────────────────────────────────────────────────────
  return React.createElement('div', {
    className: 'w-52 bg-zinc-950 border-r border-zinc-800 flex flex-col h-full shrink-0 overflow-hidden'
  },

    // ── Section 1: File tree ──────────────────────────────────
    React.createElement('div', {
      className: 'flex flex-col min-h-0',
      style: { flex: isRunActive ? '0 0 45%' : '0 0 65%' }
    },
      // Header
      React.createElement('div', {
        className: 'px-3 py-2 border-b border-zinc-800 flex items-center justify-between shrink-0'
      },
        React.createElement('span', {
          className: 'text-[10px] font-bold uppercase tracking-widest text-zinc-500'
        }, '📁 Files'),
        React.createElement('button', {
          onClick: onFetchFileTree,
          disabled: isLoading,
          title: 'Refresh file tree',
          className: 'text-zinc-600 hover:text-zinc-300 transition text-xs disabled:opacity-30'
        }, isLoading ? '⟳' : '↺')
      ),
      // Tree body
      React.createElement('div', {
        className: 'flex-1 overflow-y-auto custom-scrollbar py-1'
      },
        fileTree.length === 0
          ? React.createElement('p', {
              className: 'text-zinc-600 italic text-[11px] px-3 pt-2'
            }, isLoading ? 'Loading…' : 'No files. Set repo and click ↺')
          : renderNode(tree)
      )
    ),

    // ── Section 2: Memory ─────────────────────────────────────
    React.createElement('div', {
      className: 'flex flex-col border-t border-zinc-800',
      style: { flex: '0 0 auto', maxHeight: '30%' }
    },
      // Header
      React.createElement('div', {
        onClick: () => setShowMemory(s => !s),
        className: 'px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-zinc-900/50 shrink-0'
      },
        React.createElement('span', {
          className: 'text-[10px] font-bold uppercase tracking-widest text-zinc-500'
        }, '🧠 Memory'),
        React.createElement('span', {
          className: 'text-zinc-700 text-[10px]'
        }, showMemory ? '▾' : '▸')
      ),
      // Rules
      showMemory && React.createElement('div', {
        className: 'overflow-y-auto custom-scrollbar px-2 pb-2'
      },
        memory.length === 0
          ? React.createElement('p', {
              className: 'text-zinc-700 italic text-[11px] px-1'
            }, 'No rules. /learn to add.')
          : memory.map((m, i) =>
              React.createElement('div', {
                key: i,
                className: 'text-[11px] text-zinc-400 py-0.5 px-1 leading-snug flex gap-1'
              },
                React.createElement('span', { className: 'text-amber-600 shrink-0' }, '·'),
                React.createElement('span', { className: 'truncate' }, m)
              )
            )
      )
    ),

    // ── Section 3: Tasks (run active only) ───────────────────
    isRunActive && orchestratorTasks && orchestratorTasks.length > 0 &&
    React.createElement('div', {
      className: 'flex flex-col border-t border-zinc-800',
      style: { flex: '1 1 0', minHeight: 0 }
    },
      React.createElement('div', {
        className: 'px-3 py-2 flex items-center gap-2 shrink-0'
      },
        React.createElement('span', {
          className: 'w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0'
        }),
        React.createElement('span', {
          className: 'text-[10px] font-bold uppercase tracking-widest text-amber-500'
        }, 'Tasks')
      ),
      React.createElement('div', {
        className: 'flex-1 overflow-y-auto custom-scrollbar px-2 pb-2 space-y-1'
      },
        orchestratorTasks.map((task, i) => {
          const status = getStatus(task);
          return React.createElement('div', {
            key: task.number || i,
            className: 'rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1.5'
          },
            React.createElement('div', {
              className: 'flex items-center gap-1.5 mb-0.5'
            },
              React.createElement('span', {
                className: `w-1.5 h-1.5 rounded-full shrink-0 ${status.dot}`
              }),
              React.createElement('span', {
                className: 'text-[9px] font-bold text-zinc-600 uppercase tracking-wide'
              }, status.label)
            ),
            React.createElement('p', {
              className: 'text-[11px] text-zinc-300 leading-snug',
              style: {
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }
            }, task.title)
          );
        })
      )
    )
  );
};
