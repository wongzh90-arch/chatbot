// js/components/Navbar.jsx

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
  models, modelsLoading,
  systemPromptOverride, setSystemPromptOverride,
  provider, setProvider,
  thinkingMode, setThinkingMode,
  reasoningEffort, setReasoningEffort,
}) => {
  const [showSettings, setShowSettings] = React.useState(false);
  const [freeOnly, setFreeOnly] = React.useState(false);

  const isFreeModel = (model) => {
    if (model.free) return true;
    const id    = model.value.toLowerCase();
    const label = model.label.toLowerCase();
    return id.includes(':free') || label.includes('(free)') || label.includes('free');
  };

  const filteredModels = (provider === 'openrouter' && freeOnly)
    ? models.filter(isFreeModel)
    : models;

  return React.createElement('header', {
    className: 'bg-zinc-900 border-b border-zinc-800 shrink-0 z-20'
  },

    // ── Main bar ───────────────────────────────────────────────
    React.createElement('div', {
      className: 'flex items-center gap-3 px-4 py-2.5 flex-wrap'
    },

      // Brand
      React.createElement('span', {
        className: 'font-bold text-sm bg-gradient-to-r from-orange-400 to-amber-500 bg-clip-text text-transparent whitespace-nowrap'
      }, 'Claude Code Web'),

      // Provider toggle
      React.createElement('div', {
        className: 'flex bg-zinc-950 rounded-lg p-0.5 border border-zinc-800 shrink-0'
      },
        ['deepseek', 'openrouter'].map(p =>
          React.createElement('button', {
            key: p,
            onClick: () => setProvider(p),
            className: `px-3 py-1 rounded-md text-xs font-bold transition ${
              provider === p ? 'bg-amber-600 text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'
            }`
          }, p === 'deepseek' ? '🧠 DeepSeek' : '🔷 OpenRouter')
        )
      ),

      // Workspace toggle
      React.createElement('div', {
        className: 'flex bg-zinc-950 rounded-lg p-0.5 border border-zinc-800 shrink-0'
      },
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
          workspace === 'self'
            ? 'border-amber-500/25 bg-amber-500/5'
            : 'border-blue-500/25 bg-blue-500/5'
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

      // Fetch
      React.createElement('button', {
        onClick: onFetchFileTree,
        disabled: isLoading,
        className: 'px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 transition disabled:opacity-40 text-xs font-bold'
      }, isLoading ? '⟳' : 'Fetch'),

      // Model select
      React.createElement('select', {
        value: selectedModel,
        onChange: e => setSelectedModel(e.target.value),
        className: 'p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 outline-none text-xs text-zinc-300',
        disabled: modelsLoading,
      },
        modelsLoading && React.createElement('option', null, 'Loading…'),
        !modelsLoading && filteredModels.map(m =>
          React.createElement('option', { key: m.value, value: m.value }, m.label)
        )
      ),

      // Free-only filter (OpenRouter only)
      provider === 'openrouter' && React.createElement('label', {
        className: 'flex items-center gap-1 text-xs text-zinc-500 cursor-pointer whitespace-nowrap'
      },
        React.createElement('input', {
          type: 'checkbox',
          checked: freeOnly,
          onChange: e => setFreeOnly(e.target.checked),
          className: 'accent-amber-500 w-3 h-3'
        }),
        'Free only'
      ),

      // Spacer
      React.createElement('div', { className: 'flex-1' }),

      // Thinking mode (DeepSeek)
      provider === 'deepseek' && React.createElement('button', {
        onClick: () => setThinkingMode(!thinkingMode),
        title: 'Toggle thinking / reasoning mode',
        className: `px-3 py-1 rounded-lg text-xs font-bold transition ${
          thinkingMode ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-500'
        }`
      }, '🧠 Thinking ' + (thinkingMode ? 'ON' : 'OFF')),

      // Settings gear
      React.createElement('button', {
        onClick: () => setShowSettings(s => !s),
        className: `p-1.5 rounded-lg transition text-sm ${
          showSettings
            ? 'bg-zinc-700 text-zinc-200'
            : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
        }`
      }, '⚙️')
    ),

    // ── Settings drawer ────────────────────────────────────────
    showSettings && React.createElement('div', {
      className: 'border-t border-zinc-800 px-4 py-3 flex flex-wrap items-start gap-3 text-xs bg-zinc-950/50'
    },

      // GitHub token
      React.createElement('div', { className: 'flex flex-col gap-1' },
        React.createElement('label', { className: 'text-zinc-500' }, 'GitHub PAT'),
        React.createElement('input', {
          type: 'password',
          placeholder: 'ghp_...',
          value: githubToken,
          onChange: e => setGithubToken(e.target.value),
          className: 'p-2 rounded-lg bg-zinc-800 border border-zinc-700 w-40 focus:border-amber-500 outline-none text-zinc-300 text-xs'
        })
      ),

      // Deploy hook (self workspace only)
      workspace === 'self' && React.createElement('div', { className: 'flex flex-col gap-1' },
        React.createElement('label', { className: 'text-zinc-500' }, 'Deploy Hook'),
        React.createElement('input', {
          type: 'text',
          placeholder: 'https://api.netlify.com/…',
          value: deployHook,
          onChange: e => setDeployHook(e.target.value),
          className: 'p-2 rounded-lg bg-zinc-800 border border-zinc-700 w-56 focus:border-amber-500 outline-none text-zinc-300 text-xs'
        })
      ),

      // Remember keys
      React.createElement('label', {
        className: 'flex items-center gap-2 text-zinc-500 cursor-pointer self-end pb-2'
      },
        React.createElement('input', {
          type: 'checkbox',
          checked: rememberKeys,
          onChange: e => setRememberKeys(e.target.checked),
          className: 'accent-amber-500'
        }),
        'Remember keys'
      ),

      // Custom instructions
      React.createElement('div', { className: 'w-full' },
        React.createElement('label', { className: 'block text-zinc-500 mb-1' }, 'Custom instructions'),
        React.createElement('textarea', {
          placeholder: 'e.g. "Always respond in bullet points, be concise."',
          value: systemPromptOverride,
          onChange: e => setSystemPromptOverride(e.target.value),
          className: 'p-2 rounded-lg bg-zinc-800 border border-zinc-700 w-full max-w-sm focus:border-amber-500 outline-none text-zinc-300 text-xs h-16 resize-none',
          rows: 3
        })
      )
    )
  );
};
