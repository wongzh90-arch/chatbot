// js/app.jsx --- composition root, no business logic.
// Added: ThemeProvider wrapper, theme-aware root, sidebar, and prop passing.
const { useState, useEffect } = React;
function App() {
  // Wrap everything in ThemeProvider so useTheme() is available inside AppContent
  return React.createElement(window.ThemeProvider, null,
    React.createElement(AppContent)
  );
}
function AppContent() {
  const { theme, toggleTheme } = window.useTheme();
  // ── Core state hooks ──────────────────────────────────────────
  const provider = window.useProviderState();
  const workspace = window.useWorkspaceState();
  const conversation = window.useConversationState();
  // ── Toasts ────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);
  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };
  // ── Project memory ────────────────────────────────────────────
  const [projectMemory, setProjectMemory] = useState([]);
  useEffect(() => {
    if (!workspace.currentRepo) { setProjectMemory([]); return; }
    const saved = localStorage.getItem(`MEM_${workspace.currentRepo}`);
    setProjectMemory(saved ? JSON.parse(saved) : []);
  }, [workspace.currentRepo]);
  const addMemoryRule = (rule) => {
    const updated = [...projectMemory, rule];
    setProjectMemory(updated);
    localStorage.setItem(`MEM_${workspace.currentRepo}`, JSON.stringify(updated));
  };
  const clearMemory = () => {
    setProjectMemory([]);
    localStorage.setItem(`MEM_${workspace.currentRepo}`, JSON.stringify([]));
  };
  // ── User memory ───────────────────────────────────────────────
  const [userMemory, setUserMemory] = useState(() => {
    const saved = localStorage.getItem('USER_MEMORY');
    return saved ? JSON.parse(saved) : [];
  });
  useEffect(() => {
    localStorage.setItem('USER_MEMORY', JSON.stringify(userMemory));
  }, [userMemory]);
  // ── GitHub actions ────────────────────────────────────────────
  const github = window.useGitHubActions({
    currentRepo: workspace.currentRepo,
    currentBranch: workspace.currentBranch,
    setCurrentBranch: workspace.setCurrentBranch,
    githubToken: workspace.githubToken,
    deployHook: workspace.deployHook,
    workspace: workspace.workspace,
    addToast,
  });
  // ── Orchestrator tasks ────────────────────────────────────────
  const [orchestratorTasks, setOrchestratorTasks] = useState([]);
  // ── Input / hints ─────────────────────────────────────────────
  const [inputPrompt, setInputPrompt] = useState('');
  const [showCmdHints, setShowCmdHints] = useState(false);
  useEffect(() => { setShowCmdHints(inputPrompt.startsWith('/')); }, [inputPrompt]);
  // ── Command handler ───────────────────────────────────────────
  const commands = window.useCommandHandler({
    provider: provider.provider,
    selectedModel: provider.selectedModel,
    thinkingMode: provider.thinkingMode,
    reasoningEffort: provider.reasoningEffort,
    currentRepo: workspace.currentRepo,
    currentBranch: workspace.currentBranch,
    setCurrentBranch: workspace.setCurrentBranch,
    githubToken: workspace.githubToken,
    systemPromptOverride: workspace.systemPromptOverride,
    messages: conversation.messages,
    setMessages: conversation.setMessages,
    uploadedContext: conversation.uploadedContext,
    setUploadedContext: conversation.setUploadedContext,
    setStreamingMessage: conversation.setStreamingMessage,
    setStreamingReasoning: conversation.setStreamingReasoning,
    setStatusMessage: conversation.setStatusMessage,
    isRunActive: conversation.isRunActive,
    setIsRunActive: conversation.setIsRunActive,
    fetchFileTree: github.fetchFileTree,
    loadFile: github.loadFile,
    commitChange: github.commitChange,
    handleCreateBranch: github.handleCreateBranch,
    handleSwitchBranch: github.handleSwitchBranch,
    handleCreatePR: github.handleCreatePR,
    projectMemory, addMemoryRule, clearMemory,
    userMemory, setUserMemory,
    orchestratorTasks, setOrchestratorTasks,
    addToast,
    inputPrompt, setInputPrompt,
    manifest: workspace.manifest,
  });
  // ── onFileClick ───────────────────────────────────────────────
  const handleFileClick = async (path) => {
    const fileData = await github.loadFile(path);
    if (fileData) commands.pushFileCard(fileData);
  };
  // ── onCommitFile ──────────────────────────────────────────────
  const handleCommitFile = async (path, content, sha, message) => {
    return await github.commitChange(path, content, sha, message);
  };
  // ── Theme-aware class sets ────────────────────────────────────
  const rootBg = theme === 'dark' ? 'bg-zinc-950 text-zinc-200' : 'bg-white text-zinc-900';
  // Sidebar (conversation list)
  const sidebarBg = theme === 'dark' ? 'bg-zinc-950 border-zinc-800' : 'bg-gray-50 border-gray-200';
  const sidebarText = theme === 'dark' ? 'text-zinc-200' : 'text-gray-800';
  const sidebarMuted = theme === 'dark' ? 'text-zinc-600' : 'text-gray-400';
  const sidebarHover = theme === 'dark' ? 'hover:bg-zinc-900 hover:text-zinc-300' : 'hover:bg-gray-100 hover:text-gray-800';
  const sidebarActive = theme === 'dark' ? 'bg-zinc-800 text-zinc-200' : 'bg-blue-50 text-blue-700';
  const sidebarBorder = theme === 'dark' ? 'border-zinc-900/50' : 'border-gray-200';
  return React.createElement('div', {
    className: `flex flex-col h-screen ${rootBg} overflow-hidden`
  },
    // Toasts (keep dark for visibility, but can be themed later)
    React.createElement('div', {
      className: 'fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none'
    },
      toasts.map(t => React.createElement('div', {
        key: t.id,
        className: `px-4 py-3 rounded-xl shadow-xl border text-sm max-w-xs pointer-events-auto ${
          t.type === 'error' ? 'bg-red-950/95 border-red-800 text-red-200' :
          t.type === 'success' ? 'bg-green-950/95 border-green-800 text-green-200' :
          t.type === 'warning' ? 'bg-yellow-950/95 border-yellow-800 text-yellow-200' :
          'bg-zinc-800/95 border-zinc-700 text-zinc-200'
        }`
      }, t.message))
    ),
    // Navbar (pass theme + toggle)
    React.createElement(window.Navbar, {
      theme, toggleTheme,
      workspace: workspace.workspace,
      setWorkspace: workspace.setWorkspace,
      currentRepo: workspace.currentRepo,
      setCurrentRepo: workspace.setCurrentRepo,
      currentBranch: workspace.currentBranch,
      setCurrentBranch: workspace.setCurrentBranch,
      githubToken: workspace.githubToken,
      setGithubToken: workspace.setGithubToken,
      selectedModel: provider.selectedModel,
      setSelectedModel: provider.setSelectedModel,
      deployHook: workspace.deployHook,
      setDeployHook: workspace.setDeployHook,
      onFetchFileTree: github.fetchFileTree,
      isLoading: github.isLoading,
      rememberKeys: workspace.rememberKeys,
      setRememberKeys: workspace.setRememberKeys,
      models: provider.models,
      modelsLoading: provider.modelsLoading,
      systemPromptOverride: workspace.systemPromptOverride,
      setSystemPromptOverride: workspace.setSystemPromptOverride,
      provider: provider.provider,
      setProvider: provider.setProvider,
      thinkingMode: provider.thinkingMode,
      setThinkingMode: provider.setThinkingMode,
      reasoningEffort: provider.reasoningEffort,
      setReasoningEffort: provider.setReasoningEffort,
    }),
    // Body
    React.createElement(window.ErrorBoundary, null,
      React.createElement('div', { className: 'flex flex-1 overflow-hidden' },
        // Conversation list sidebar (theme‑aware)
        React.createElement('div', {
          className: `w-36 ${sidebarBg} border-r flex flex-col shrink-0`
        },
          React.createElement('div', {
            className: `px-2 py-2 border-b ${sidebarBorder} flex items-center justify-between`
          },
            React.createElement('span', {
              className: `text-[10px] font-bold uppercase ${sidebarMuted} tracking-widest`
            }, 'Chats'),
            React.createElement('button', {
              onClick: conversation.createNewConversation,
              className: 'text-[10px] bg-amber-600 hover:bg-amber-500 text-zinc-950 px-2 py-0.5 rounded font-bold transition'
            }, '+ New')
          ),
          React.createElement('div', { className: 'flex-1 overflow-y-auto custom-scrollbar' },
            conversation.conversations.map(conv =>
              React.createElement('div', {
                key: conv.id,
                onClick: () => conversation.setActiveConversationId(conv.id),
                className: `group flex items-center justify-between px-2 py-2 cursor-pointer transition border-b ${sidebarBorder} ${
                  conv.id === conversation.activeConversationId
                    ? sidebarActive
                    : `${sidebarMuted} ${sidebarHover}`
                }`
              },
                React.createElement('span', { className: 'text-[11px] truncate flex-1' }, conv.title),
                React.createElement('button', {
                  onClick: e => { e.stopPropagation(); conversation.deleteConversation(conv.id); },
                  className: 'opacity-0 group-hover:opacity-100 text-zinc-700 hover:text-red-400 ml-1 text-sm leading-none transition'
                }, '×')
              )
            )
          )
        ),
        // Left pane (theme prop passed)
        React.createElement(window.LeftPane, {
          theme,
          fileTree: github.fileTree,
          onFileClick: handleFileClick,
          recentlyModified: github.recentlyModified,
          memory: projectMemory,
          orchestratorTasks,
          isRunActive: conversation.isRunActive,
          isLoading: github.isLoading,
          onFetchFileTree: github.fetchFileTree,
        }),
        // Chat pane (theme prop passed)
        React.createElement(window.ChatPane, {
          theme,
          messages: conversation.messages,
          inputPrompt,
          setInputPrompt,
          uploadedContext: conversation.uploadedContext,
          setUploadedContext: conversation.setUploadedContext,
          isLoading: github.isLoading,
          onSend: commands.sendMessage,
          onFileUpload: commands.handleFileUpload,
          showCmdHints,
          onCmdHintClick: cmd => {
            setInputPrompt(cmd + ' ');
            if (conversation.inputRef.current) conversation.inputRef.current.focus();
          },
          chatScrollRef: conversation.chatScrollRef,
          inputRef: conversation.inputRef,
          streamingMessage: conversation.streamingMessage,
          statusMessage: conversation.statusMessage,
          isRunActive: conversation.isRunActive,
          onPause: () => {
            if (window.Orchestrator) window.Orchestrator.requestPause('user');
            addToast('⏸ Pause requested — stopping after current task', 'info');
          },
          onCommitFile: handleCommitFile,
        })
      )
    )
  );
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
