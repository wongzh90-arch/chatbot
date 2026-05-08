// js/app.jsx --- composition root, no business logic.
const { useState, useEffect, useRef } = React;

function App() {
  return React.createElement(window.ThemeProvider, null,
    React.createElement(AppContent)
  );
}

function AppContent() {
  const { theme, toggleTheme } = window.useTheme();

  // ── Core state hooks ──────────────────────────────────────────
  const provider    = window.useProviderState();
  const workspace   = window.useWorkspaceState();
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
        localStorage.setItem(`MEM_${workspace.currentRepo}`, JSON.stringify([]));
  };
 // ── User memory ───────────────────────────────────────────────
  const [userMemory, setUserMemory] = useState(() => {
    const saved = localStorage.getItem('USER_MEMORY');
    return saved ? JSON.parse(saved) : [];
        localStorage.setItem('USER_MEMORY', JSON.stringify(userMemory));
  }, [userMemory]);
 // ── Layout state ──────────────────────────────────────────────
  // showConvDrawer: mobile slide-up conversation list
  // showLeftPane:  desktop side panel (files/memory/tasks)
  // mobileTab:     which bottom tab is active on mobile
  const [showConvDrawer, setShowConvDrawer] = useState(false);
  const [showLeftPane,   setShowLeftPane]   = useState(false);
  const [mobileTab,      setMobileTab]      = useState('chat'); // 'chat' | 'files' | 'tasks'

  // ── Tab (Navbar) ──────────────────────────────────────────────
  const [mobileTab,      setMobileTab]      = useState('chat');
  const [activeTab, setActiveTab] = useState('chat');

  // Sync activeTab → mobileTab on desktop tab clicks
  useEffect(() => { setMobileTab(activeTab); }, [activeTab]);

  // When run starts, switch to tasks; when done, back to chat
  useEffect(() => {
    // Stay in current tab – do NOT auto‑switch to tasks
    if (!conversation.isRunActive) {
      setActiveTab('chat');
      setMobileTab('chat');
      setTimeout(() => conversation.scrollToBottom(), 50);
    }
  }, [conversation.isRunActive]);
  
  // ── GitHub actions ────────────────────────────────────────────

  const github = window.useGitHubActions({
    currentRepo:    workspace.currentRepo,
    currentBranch:  workspace.currentBranch,
       addToast,
  });

  // ── Orchestrator tasks ────────────────────────────────────────
  const [orchestratorTasks, setOrchestratorTasks] = useState([]);

  // ── Input / hints ─────────────────────────────────────────────
  const [inputPrompt,   setInputPrompt]   = useState('');
  const [showCmdHints,  setShowCmdHints]  = useState(false);
  useEffect(() => { setShowCmdHints(inputPrompt.startsWith('/')); }, [inputPrompt]);

  // ── Command handler ───────────────────────────────────────────
  const commands = window.useCommandHandler({
    provider:             provider.provider,
    selectedModel:        provider.selectedModel,
    inputPrompt, setInputPrompt,
    manifest:             workspace.manifest,
    setStatusMessage:     conversation.setStatusMessage,
    conversation,         // <-- ADDED
    fileTree:             github.fileTree, // <-- ADDED
  });

  // ── File interactions ─────────────────────────────────────────
  const handleFileClick = async (path) => {
    const fileData = await github.loadFile(path);
    if (fileData) commands.pushFileCard(fileData);
    return await github.commitChange(path, content, sha, message);
  };
  // ── Theme tokens ──────────────────────────────────────────────
  const isDark = theme === 'dark';
  const bg        = isDark ? 'bg-zinc-950'   : 'bg-white';
  const border    = isDark ? 'border-zinc-800' : 'border-gray-200';
   const hoverBg   = isDark ? 'hover:bg-zinc-800' : 'hover:bg-gray-100';
  const activeConvBg = isDark ? 'bg-zinc-800 text-zinc-100' : 'bg-amber-50 text-amber-800';

  // ── Tasks panel (full-width, used in both desktop tasks tab and mobile tasks tab) ──
  const TasksPanel = () => {
    const tasks  = window.TaskQueue ? window.TaskQueue.getAllTasks() : orchestratorTasks || [];
    const state  = window.TaskQueue ? window.TaskQueue.getState()   : null;
    const statusColors = {
      DONE:        'text-green-400',
      IN_PROGRESS: 'text-amber-400',
      REVIEW:      'text-purple-400',
      FAILED:      'text-red-400',
      TODO:        isDark ? 'text-zinc-500' : 'text-gray-400',
    };
    const statusBg = {
      DONE:        'border-green-800/40 bg-green-950/20',
      IN_PROGRESS: 'border-amber-700/40 bg-amber-950/20',
      REVIEW:      'border-purple-700/40 bg-purple-950/20',
      FAILED:      'border-red-800/40 bg-red-950/20',
      TODO:        isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-gray-200 bg-gray-50',
    };
    return React.createElement('div', { className: `flex-1 flex flex-col overflow-hidden ${bg}` },
      React.createElement('div', {
        className: `px-4 py-3 border-b ${border} shrink-0 font-bold text-xs uppercase tracking-widest text-green-400 ${sidebarBg}`
      }, '📋 Task Queue'),
      React.createElement('div', { className: 'flex-1 overflow-y-auto p-4 custom-scrollbar' },
        (() => {
          if (tasks.length === 0) return React.createElement('p', {
            className: `text-sm ${textMuted} italic`
          }, 'No active tasks. Use /plan <goal> to create a plan.');
          return React.createElement('div', { className: 'space-y-3' },
            state?.goal && React.createElement('div', {
              className: `text-xs px-3 py-2 rounded-lg border ${isDark ? 'border-amber-800/40 bg-amber-950/20 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-700'}`
            }, `🎯 Goal: ${state.goal}`),
            tasks.map(t => React.createElement('div', {
              key: t.id,
              className: `rounded-xl border p-3 text-sm ${statusBg[t.status] || statusBg.TODO}`
            },
              React.createElement('div', { className: 'flex items-center gap-2 mb-1' },
                React.createElement('span', { className: `text-xs font-bold ${statusColors[t.status] || ''}` }, t.status),
                React.createElement('span', { className: `font-medium ${textPrimary}` }, t.title)
              ),
              t.description && React.createElement('p', { className: `text-xs mt-1 ${textMuted}` }, t.description),
              t.files && t.files.length > 0 && React.createElement('div', { className: 'mt-2 flex flex-wrap gap-1' },
                t.files.map(f => React.createElement('span', {
                  key: f,
                  className: `text-[10px] font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-100 text-gray-500'}`
                }, f.split('/').pop()))
              ),
              t.error && React.createElement('p', { className: 'text-xs text-red-400 mt-1' }, `Error: ${t.error}`)
            ))
          );
        })()
      )
    );
  };

  // ── Conversation sidebar (shared by desktop + mobile drawer) ──
  const ConvList = ({ onSelect }) => React.createElement('div', { className: 'flex flex-col h-full' },
    // Header
    React.createElement('div', {
      className: `px-3 py-3 border-b ${border} flex items-center justify-between shrink-0`
    },
      React.createElement('span', { className: `text-xs font-bold uppercase tracking-widest ${textMuted}` }, 'Chats'),
      React.createElement('button', {
        onClick: () => { conversation.createNewConversation(); if (onSelect) onSelect(); },
        className: 'text-[11px] bg-amber-600 hover:bg-amber-500 text-zinc-950 px-2.5 py-1 rounded-lg font-bold transition'
      }, '+ New')
    ),
    // List
    React.createElement('div', { className: 'flex-1 overflow-y-auto custom-scrollbar py-1' },
      conversation.conversations.map(conv =>
        React.createElement('div', {
          key: conv.id,
          onClick: () => { conversation.setActiveConversationId(conv.id); if (onSelect) onSelect(); },
          className: `group flex items-center justify-between px-3 py-2.5 mx-1 rounded-lg cursor-pointer transition mb-0.5 ${
            conv.id === conversation.activeConversationId
              ? activeConvBg
              : `${textMuted} ${hoverBg}`
          }`
        },
          React.createElement('span', { className: 'text-[12px] truncate flex-1 leading-snug' }, conv.title),
          React.createElement('button', {
            onClick: e => { e.stopPropagation(); conversation.deleteConversation(conv.id); },
            className: 'opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 ml-1 text-base leading-none transition shrink-0'
          }, '×')
        )
      )
    )
  );

  // ── Mobile: conversation drawer (slide up from bottom) ────────
  const MobileConvDrawer = () => React.createElement(React.Fragment, null,
    // Backdrop
    React.createElement('div', {
      onClick: () => setShowConvDrawer(false),
      className: `fixed inset-0 z-40 bg-black/50 transition-opacity ${showConvDrawer ? 'opacity-100' : 'opacity-0 pointer-events-none'}`,
      style: { transition: 'opacity 220ms ease-out' }
    }),
    // Sheet
    React.createElement('div', {
      className: `fixed bottom-0 left-0 right-0 z-50 ${sidebarBg} border-t ${border} rounded-t-2xl`,
      style: {
        height: '70vh',
        transform: showConvDrawer ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
      }
    },
      // Drag handle
      React.createElement('div', { className: 'flex justify-center pt-2.5 pb-1' },
        React.createElement('div', { className: `w-10 h-1 rounded-full ${isDark ? 'bg-zinc-700' : 'bg-gray-300'}` })
      ),
      React.createElement(ConvList, { onSelect: () => setShowConvDrawer(false) })
    )
  );

  // ── Mobile: bottom tab bar ────────────────────────────────────
  const MobileTabBar = () => {
    const tabs = [
      { id: 'chat',  icon: '💬', label: 'Chat' },
      { id: 'files', icon: '📁', label: 'Files' },
      { id: 'tasks', icon: '📋', label: 'Tasks' },
    ];
    return React.createElement('div', {
      className: `flex border-t ${border} ${sidebarBg} shrink-0 safe-area-bottom`
    },
      tabs.map(tab => React.createElement('button', {
        key: tab.id,
        onClick: () => setMobileTab(tab.id),
        className: `flex-1 flex flex-col items-center gap-0.5 py-2.5 transition ${
          mobileTab === tab.id
            ? 'text-amber-500'
            : `${textMuted} active:scale-95`
        }`
      },
        React.createElement('span', { className: 'text-lg leading-none' }, tab.icon),
        React.createElement('span', { className: 'text-[10px] font-medium' }, tab.label)
      )),
      // Conversations button
      React.createElement('button', {
        onClick: () => setShowConvDrawer(true),
        className: `flex-1 flex flex-col items-center gap-0.5 py-2.5 transition ${textMuted} active:scale-95`
      },
        React.createElement('span', { className: 'text-lg leading-none' }, '🗂️'),
        React.createElement('span', { className: 'text-[10px] font-medium' }, 'History')
      )
    );
  };

  // ── Desktop: left panel toggle button (in Navbar area) ────────
  // We pass a custom slot via the existing Navbar. Since Navbar doesn't support
  // arbitrary children, we'll overlay a toggle button above the body.

  // ── Main render ───────────────────────────────────────────────
  return React.createElement('div', {
    className: `flex flex-col h-screen ${bg} overflow-hidden`
  },
    // ── Toasts ──────────────────────────────────────────────────
    React.createElement('div', {
      className: 'fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none'
    },
      toasts.map(t => React.createElement('div', {
        key: t.id,
        className: `px-4 py-3 rounded-xl shadow-xl border text-sm max-w-xs pointer-events-auto ${
          t.type === 'error'   ? 'bg-red-950/95 border-red-800 text-red-200'     :
          t.type === 'success' ? 'bg-green-950/95 border-green-800 text-green-200' :
          t.type === 'warning' ? 'bg-yellow-950/95 border-yellow-800 text-yellow-200' :
          'bg-zinc-800/95 border-zinc-700 text-zinc-200'
        }`
      }, t.message))
    ),
 // ── Navbar ───────────────────────────────────────────────────
    React.createElement(window.Navbar, {
      theme, toggleTheme,
      workspace:            workspace.workspace,
      setWorkspace:         workspace.setWorkspace,
      currentRepo:          workspace.currentRepo,
      setCurrentRepo:       workspace.setCurrentRepo,
      currentBranch:        workspace.currentBranch,
      setCurrentBranch:     workspace.setCurrentBranch,
      githubToken:          workspace.githubToken,
      setGithubToken:       workspace.setGithubToken,
      selectedModel:        provider.selectedModel,
      setSelectedModel:     provider.setSelectedModel,
      deployHook:           workspace.deployHook,
      setDeployHook:        workspace.setDeployHook,
      onFetchFileTree:      github.fetchFileTree,
      isLoading:            github.isLoading,
      rememberKeys:         workspace.rememberKeys,
      setRememberKeys:      workspace.setRememberKeys,
      models:               provider.models,
      modelsLoading:        provider.modelsLoading,
      systemPromptOverride: workspace.systemPromptOverride,
      setSystemPromptOverride: workspace.setSystemPromptOverride,
      provider:             provider.provider,
      setProvider:          provider.setProvider,
      thinkingMode:         provider.thinkingMode,
      setThinkingMode:      provider.setThinkingMode,
      reasoningEffort:      provider.reasoningEffort,
      setReasoningEffort:   provider.setReasoningEffort,
      activeTab,
      setActiveTab,
    }),
// ── Body ─────────────────────────────────────────────────────
    React.createElement(window.ErrorBoundary, null,

      // ════════════════════════════════════════════════════════════
      // DESKTOP LAYOUT  (md and above)
      // ════════════════════════════════════════════════════════════
      React.createElement('div', { className: 'hidden md:flex flex-1 overflow-hidden' },

        // ── Desktop: conversation sidebar (always visible) ───────
        React.createElement('div', {
          className: `w-52 shrink-0 ${sidebarBg} border-r ${border} flex flex-col overflow-hidden`
        },
          React.createElement(ConvList, null)
        ),

        // ── Desktop: optional LeftPane (files/memory/tasks) ──────
        showLeftPane && React.createElement('div', {
          className: `w-56 shrink-0 border-r ${border} flex flex-col overflow-hidden`,
          style: {
            transform: showLeftPane ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 250ms cubic-bezier(0.22, 1, 0.36, 1)',
          }
        },
          React.createElement(window.LeftPane, {
            theme,
            fileTree:          github.fileTree,
            onFileClick:       handleFileClick,
            recentlyModified:  github.recentlyModified,
            memory:            projectMemory,
            orchestratorTasks,
            isRunActive:       conversation.isRunActive,
            isLoading:         github.isLoading,
            onFetchFileTree:   github.fetchFileTree,
          })
        ),

        // ── Desktop: main area ────────────────────────────────────
        React.createElement('div', { className: 'flex flex-1 flex-col overflow-hidden' },

          // Toggle strip for LeftPane
          React.createElement('div', {
            className: `flex items-center gap-2 px-3 py-1.5 border-b ${border} ${sidebarBg} shrink-0`
          },
            React.createElement('button', {
              onClick: () => setShowLeftPane(v => !v),
              title: showLeftPane ? 'Hide panel' : 'Show files & memory',
              className: `flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border transition ${
                showLeftPane
                  ? isDark ? 'border-amber-600/50 bg-amber-600/10 text-amber-400' : 'border-amber-400/50 bg-amber-50 text-amber-600'
                  : `border-transparent ${textMuted} ${hoverBg}`
              }`
            },
              React.createElement('span', null, showLeftPane ? '◀' : '▶'),
              React.createElement('span', null, showLeftPane ? 'Hide panel' : 'Files & Memory')
            ),
            // Workspace indicator
            React.createElement('span', {
              className: `ml-auto text-[10px] font-mono px-2 py-0.5 rounded border ${
                isDark ? 'border-zinc-700 text-zinc-500' : 'border-gray-200 text-gray-400'
              }`
            }, workspace.currentRepo || 'no repo')
          ),

          // Tasks tab or ChatPane
          activeTab === 'tasks'
            ? React.createElement(TasksPanel, null)
            : React.createElement(window.ChatPane, {
                theme,
                messages:          conversation.messages,
                inputPrompt,
                setInputPrompt,
                uploadedContext:   conversation.uploadedContext,
                setUploadedContext: conversation.setUploadedContext,
                isLoading:         github.isLoading,
                onSend:            commands.sendMessage,
                onFileUpload:      commands.handleFileUpload,
                showCmdHints,
                onCmdHintClick: cmd => {
                  setInputPrompt(cmd + ' ');
                  if (conversation.inputRef.current) conversation.inputRef.current.focus();
                },
                chatScrollRef:     conversation.chatScrollRef,
                inputRef:          conversation.inputRef,
                streamingMessage:  conversation.streamingMessage,
                statusMessage:     conversation.statusMessage,
                isRunActive:       conversation.isRunActive,
                onPause: () => {
                  if (window.Orchestrator) window.Orchestrator.requestPause('user');
                  addToast('⏸ Pause requested — stopping after current task', 'info');
                },
                onCommitFile: handleCommitFile,
              })
        )
      ),

      // ════════════════════════════════════════════════════════════
      // MOBILE LAYOUT  (below md)
      // ════════════════════════════════════════════════════════════
      React.createElement('div', { className: 'flex md:hidden flex-1 flex-col overflow-hidden' },

        // Active tab content
        mobileTab === 'tasks'
          ? React.createElement(TasksPanel, null)

          : mobileTab === 'files'
          ? React.createElement('div', { className: 'flex-1 overflow-hidden' },
              React.createElement(window.LeftPane, {
                theme,
                fileTree:          github.fileTree,
                onFileClick:       (path) => { handleFileClick(path); setMobileTab('chat'); },
                recentlyModified:  github.recentlyModified,
                memory:            projectMemory,
                orchestratorTasks,
                isRunActive:       conversation.isRunActive,
                isLoading:         github.isLoading,
                onFetchFileTree:   github.fetchFileTree,
              })
            )

          : // 'chat' (default)
          React.createElement(window.ChatPane, {
            theme,
            messages:          conversation.messages,
            inputPrompt,
            setInputPrompt,
            uploadedContext:   conversation.uploadedContext,
            setUploadedContext: conversation.setUploadedContext,
            isLoading:         github.isLoading,
            onSend:            commands.sendMessage,
            onFileUpload:      commands.handleFileUpload,
            showCmdHints,
            onCmdHintClick: cmd => {
              setInputPrompt(cmd + ' ');
              if (conversation.inputRef.current) conversation.inputRef.current.focus();
            },
            chatScrollRef:     conversation.chatScrollRef,
            inputRef:          conversation.inputRef,
            streamingMessage:  conversation.streamingMessage,
            statusMessage:     conversation.statusMessage,
            isRunActive:       conversation.isRunActive,
            onPause: () => {
              if (window.Orchestrator) window.Orchestrator.requestPause('user');
              addToast('⏸ Pause requested — stopping after current task', 'info');
            },
            onCommitFile: handleCommitFile,
          }),

        // Bottom tab bar (always visible on mobile)
        React.createElement(MobileTabBar, null),

        // Conversation drawer
        React.createElement(MobileConvDrawer, null)
      )
    )
  );

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
