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
}) => {
    return React.createElement('header', { className: 'bg-zinc-900 border-b border-zinc-800 p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2 text-xs shrink-0 z-20' },
        React.createElement('div', { className: 'flex items-center gap-3' },
            React.createElement('span', { className: 'font-bold text-base bg-gradient-to-r from-orange-400 to-amber-500 bg-clip-text text-transparent' }, 'Claude Code Web'),
            React.createElement('div', { className: 'flex bg-zinc-950 rounded p-1 border border-zinc-800' },
                React.createElement('button', { onClick: () => setWorkspace('self'), className: `px-3 py-1 rounded text-xs font-bold ${workspace==='self'?'bg-amber-600 text-zinc-950':'text-zinc-500'}` }, '🛠️ Self'),
                React.createElement('button', { onClick: () => setWorkspace('target'), className: `px-3 py-1 rounded text-xs font-bold ${workspace==='target'?'bg-amber-600 text-zinc-950':'text-zinc-500'}` }, '🎯 Target')
            ),
            React.createElement('div', { className: 'flex lg:hidden gap-1' },
                ['tree','memory','editor','tasks','chat'].map(tab =>
                    React.createElement('button', { key: tab, onClick: () => setActiveTab(tab), className: `px-2 py-1 rounded capitalize text-xs ${activeTab===tab?'bg-zinc-700 text-white':'text-zinc-400'}` }, tab)
                )
            )
        ),
        React.createElement('div', { className: 'flex flex-wrap items-center gap-2' },
            // Only GitHub token input remains (still optional)
            React.createElement('input', { type: 'password', placeholder: 'GitHub PAT', value: githubToken, onChange: e => setGithubToken(e.target.value), className: 'p-1.5 rounded bg-zinc-800 border border-zinc-700 w-28 focus:border-amber-500 outline-none' }),
            React.createElement('div', { className: `flex items-center gap-1 px-2 py-1 rounded border ${workspace==='self'?'border-amber-500/30':'border-blue-500/30'}` },
                React.createElement('span', { className: 'text-[10px] font-bold uppercase text-zinc-500' }, workspace==='self'?'Self:':'Target:'),
                React.createElement('input', { type: 'text', placeholder: 'owner/repo', value: currentRepo, onChange: e => setCurrentRepo(e.target.value), className: 'p-1 rounded bg-zinc-900 border border-zinc-700 w-28 focus:border-amber-500 outline-none' }),
                React.createElement('input', { type: 'text', placeholder: 'branch', value: currentBranch, onChange: e => setCurrentBranch(e.target.value), className: 'p-1 rounded bg-zinc-900 border border-zinc-700 w-16 hidden sm:block focus:border-amber-500 outline-none' })
            ),
            React.createElement('select', { value: selectedModel, onChange: e => setSelectedModel(e.target.value), className: 'p-1.5 rounded bg-zinc-800 border border-zinc-700 outline-none hidden md:block' },
                React.createElement('option', { value: 'openrouter/auto' }, 'Auto (Free)'),
                React.createElement('option', { value: 'anthropic/claude-3-haiku' }, 'Claude 3 Haiku'),
                React.createElement('option', { value: 'google/gemini-flash-1.5' }, 'Gemini 1.5 Flash')
            ),
            React.createElement('button', { onClick: onFetchFileTree, disabled: isLoading, className: 'px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded border border-zinc-600 transition disabled:opacity-50' }, 'Fetch'),
            workspace === 'self' && React.createElement('input', { type: 'text', placeholder: 'Deploy Hook URL', value: deployHook, onChange: e => setDeployHook(e.target.value), className: 'p-1.5 rounded bg-zinc-800 border border-zinc-700 w-40 focus:border-amber-500 outline-none' }),
            React.createElement('label', { className: 'flex items-center gap-1 text-zinc-500 text-xs' },
                React.createElement('input', { type: 'checkbox', checked: rememberKeys, onChange: e => setRememberKeys(e.target.checked), className: 'accent-amber-500' }),
                'Remember keys'
            )
        )
    );
};
