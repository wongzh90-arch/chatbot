window.Navbar = ({
  workspace, setWorkspace,
  currentRepo, setCurrentRepo,
  currentBranch, setCurrentBranch,
  githubToken, setGithubToken,
  selectedModel, setSelectedModel,
  deployHook, setDeployHook,
  onFetchFileTree,
  isLoading,
  rememberKeys, setRememberKeys,
  activeTab, setActiveTab,
  models, modelsLoading,
  systemPromptOverride, setSystemPromptOverride   // new
}) => {
  const [showSettings, setShowSettings] = React.useState(false);
  const [freeOnly, setFreeOnly] = React.useState(false);

  const isFreeModel = (model) => {
    if (model.free) return true;
    const id = model.value.toLowerCase();
    const label = model.label.toLowerCase();
    return id.includes(':free') || label.includes('(free)') || label.includes('free');
  };

  const filteredModels = freeOnly ? models.filter(isFreeModel) : models;

  const tabs = [
    { id: 'chat', label: '💬', title: 'Chat' },
    { id: 'editor', label: '📝', title: 'Editor' },
    { id: 'tree', label: '📁', title: 'Files' },
    { id: 'tasks', label: '📋', title: 'Tasks' },
  ];

  return React.createElement('header', {
    className: 'bg-zinc-900 border-b border-zinc-800 shrink-0 z-20'
  },
    React.createElement('div', { className: 'flex items-center gap-3 px-4 py-2.5' },

      // Brand
      React.createElement('span', { className: 'font-bold text-sm bg-gradient-to-r from-orange-400 to-amber-500 bg-clip-text text-transparent whitespace-nowrap' },
        'Claude Code Web'
      ),

      // Workspace toggle
      React.createElement('div', { className: 'flex bg-zinc-950 rounded-lg p-0.5 border border-zinc-800 shrink-0' },
        ['self', 'target'].map(ws =>
          React.createElement('button', {
            key: ws,
            onClick: () => setWorkspace(ws),
            className: `px-3 py-1 rounded-md text-xs font-bold transition ${
              workspace === ws ? 'bg-amber-600 text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'
            }`
          }, ws === 'self' ? '🛠️ Self' : '🎯 Target')
        )
      ),

      // Repo + branch
      React.createElement('div', {
        className: `flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs ${
          workspace === 'self' ? 'border-amber-500/25 bg-amber-500/5' : 'border-blue-500/25 bg-blue-500/5'
        }`
      },
        React.createElement('input', {
          type: 'text',
          placeholder: 'owner/repo',
          value: currentRepo,
          onChange: e => setCurrentRepo(e.target.value),
          className: 'bg-transparent outline-none text-zinc-300 w-28 placeholder-zinc-600 font-mono text-xs'
        }),
        React.createElement('span', { className: 'text-zinc-700' }, '/'),
        React.createElement('input', {
          type: 'text',
          placeholder: 'branch',
          value: currentBranch,
          onChange: e => setCurrentBranch(e.target.value),
          className: 'bg-transparent outline-none text-zinc-400 w-16 placeholder-zinc-700 font-mono text-xs'
        })
      ),

      // Fetch button
      React.createElement('button', {
        onClick: onFetchFileTree,
        disabled: isLoading,
        className: 'px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 transition disabled:opacity-40 text-xs font-bold'
      }, isLoading ? '⟳' : 'Fetch'),

      // Model select
      React.createElement('div', { className: 'hidden md:flex items-center gap-2' },
        React.createElement('select', {
          value: selectedModel,
          onChange: e => setSelectedModel(e.target.value),
          className: 'p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 outline-none text-xs text-zinc-300',
          disabled: modelsLoading
        },
          modelsLoading && React.createElement('option', null, 'Loading models...'),
          !modelsLoading && filteredModels.map(m =>
            React.createElement('option', { key: m.value, value: m.value }, m.label)
          )
        ),
        React.createElement('label', { className: 'flex items-center gap-1 text-xs text-zinc-500 cursor-pointer whitespace-nowrap' },
          React.createElement('input', {
            type: 'checkbox',
            checked: freeOnly,
            onChange: e => setFreeOnly(e.target.checked),
            className: 'accent-amber-500 w-3 h-3'
          }),
          'Free only'
        )
      ),

      // Spacer
      React.createElement('div', { className: 'flex-1' }),

      // Tab buttons (desktop)
      React.createElement('div', { className: 'hidden lg:flex gap-1' },
        tabs.map(tab => React.createElement('button', {
          key: tab.id,
          onClick: () => setActiveTab(tab.id),
          title: tab.title,
          className: `px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            activeTab === tab.id
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
          }`
        }, `${tab.label} ${tab.title}`)
        )
      ),

      // Settings toggle
      React.createElement('button', {
        onClick: () => setShowSettings(s => !s),
        className: 'p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition text-sm'
      }, '⚙️')
    ),

    // Settings drawer
    showSettings && React.createElement('div', {
      className: 'border-t border-zinc-800 px-4 py-3 flex flex-wrap items-center gap-3 text-xs bg-zinc-950/50'
    },
      React.createElement('input', {
        type: 'password',
        placeholder: 'GitHub PAT',
        value: githubToken,
        onChange: e => setGithubToken(e.target.value),
        className: 'p-2 rounded-lg bg-zinc-800 border border-zinc-700 w-36 focus:border-amber-500 outline-none text-zinc-300 text-xs'
      }),
      workspace === 'self' && React.createElement('input', {
        type: 'text',
        placeholder: 'Deploy Hook URL',
        value: deployHook,
        onChange: e => setDeployHook(e.target.value),
        className: 'p-2 rounded-lg bg-zinc-800 border border-zinc-700 w-48 focus:border-amber-500 outline-none text-zinc-300 text-xs'
      }),
      React.createElement('label', { className: 'flex items-center gap-2 text-zinc-500 cursor-pointer' },
        React.createElement('input', {
          type: 'checkbox',
          checked: rememberKeys,
          onChange: e => setRememberKeys(e.target.checked),
          className: 'accent-amber-500'
        }),
        React.createElement('span', null, 'Remember keys')
      ),

      // System prompt override
      React.createElement('div', { className: 'w-full' },
        React.createElement('label', { className: 'block text-zinc-500 text-xs mb-1' }, 'Custom instructions'),
        React.createElement('textarea', {
          placeholder: 'e.g. "Always respond in bullet points, be concise, never use jokes."',
          value: systemPromptOverride,
          onChange: e => setSystemPromptOverride(e.target.value),
          className: 'p-2 rounded-lg bg-zinc-800 border border-zinc-700 w-64 focus:border-amber-500 outline-none text-zinc-300 text-xs h-16 resize-none',
          rows: 3
        })
      ),

      // Mobile tab buttons
      React.createElement('div', { className: 'flex gap-1 lg:hidden ml-auto' },
        tabs.map(tab => React.createElement('button', {
          key: tab.id,
          onClick: () => { setActiveTab(tab.id); setShowSettings(false); },
          className: `px-2.5 py-1 rounded-lg text-xs ${
            activeTab === tab.id ? 'bg-zinc-700 text-white' : 'text-zinc-500 bg-zinc-800'
          }`
        }, tab.label)
        )
      )
    )
  );
};
