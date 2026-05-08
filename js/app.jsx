// js/app.jsx --- composition root, no business logic.
const { useState, useEffect, useRef } = React;

function App() {
  return React.createElement(window.ThemeProvider, null,
    React.createElement(AppContent)
  );
}

function AppContent() {
  const { theme, toggleTheme } = window.useTheme();

  const provider    = window.useProviderState();
  const workspace   = window.useWorkspaceState();
  const conversation = window.useConversationState();

  const [toasts, setToasts] = useState([]);
  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };

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

  const [userMemory, setUserMemory] = useState(() => {
    const saved = localStorage.getItem('USER_MEMORY');
    return saved ? JSON.parse(saved) : [];
  });
  useEffect(() => {
    localStorage.setItem('USER_MEMORY', JSON.stringify(userMemory));
  }, [userMemory]);

  const [showConvDrawer, setShowConvDrawer] = useState(false);
  const [showLeftPane,   setShowLeftPane]   = useState(false);
  const [mobileTab,      setMobileTab]      = useState('chat');
  const [activeTab, setActiveTab] = useState('chat');
  useEffect(() => { setMobileTab(activeTab); }, [activeTab]);
  useEffect(() => {
    if (!conversation.isRunActive) {
      setActiveTab('chat');
      setMobileTab('chat');
      setTimeout(() => conversation.scrollToBottom(), 50);
    }
  }, [conversation.isRunActive]);

  const github = window.useGitHubActions({
    currentRepo:    workspace.currentRepo,
    currentBranch:  workspace.currentBranch,
    setCurrentBranch: workspace.setCurrentBranch,
    githubToken:    workspace.githubToken,
    deployHook:     workspace.deployHook,
    workspace:      workspace.workspace,
    addToast,
  });

  const [orchestratorTasks, setOrchestratorTasks] = useState([]);
  const [inputPrompt,   setInputPrompt]   = useState('');
  const [showCmdHints,  setShowCmdHints]  = useState(false);
  useEffect(() => { setShowCmdHints(inputPrompt.startsWith('/')); }, [inputPrompt]);

  const commands = window.useCommandHandler({
    provider:             provider.provider,
    selectedModel:        provider.selectedModel,
    thinkingMode:         provider.thinkingMode,
    reasoningEffort:      provider.reasoningEffort,
    currentRepo:          workspace.currentRepo,
    currentBranch:        workspace.currentBranch,
    setCurrentBranch:     workspace.setCurrentBranch,
    githubToken:          workspace.githubToken,
    systemPromptOverride: workspace.systemPromptOverride,
    messages:             conversation.messages,
    setMessages:          conversation.setMessages,
    uploadedContext:      conversation.uploadedContext,
    setUploadedContext:   conversation.setUploadedContext,
    setStreamingMessage:  conversation.setStreamingMessage,
    setStreamingReasoning: conversation.setStreamingReasoning,
    isRunActive:          conversation.isRunActive,
    setIsRunActive:       conversation.setIsRunActive,
    fetchFileTree:        github.fetchFileTree,
    loadFile:             github.loadFile,
    commitChange:         github.commitChange,
    handleCreateBranch:   github.handleCreateBranch,
    handleSwitchBranch:   github.handleSwitchBranch,
    handleCreatePR:       github.handleCreatePR,
    projectMemory, addMemoryRule, clearMemory,
    userMemory, setUserMemory,
    orchestratorTasks, setOrchestratorTasks,
    addToast,
    inputPrompt, setInputPrompt,
    manifest:             workspace.manifest,
    setStatusMessage:     conversation.setStatusMessage,
    conversation,         // <-- ADDED
    fileTree:             github.fileTree, // <-- ADDED
  });

  const handleFileClick = async (path) => {
    const fileData = await github.loadFile(path);
    if (fileData) commands.pushFileCard(fileData);
  };
  const handleCommitFile = async (path, content, sha, message) => {
    return await github.commitChange(path, content, sha, message);
  };

  const isDark = theme === 'dark';
  const bg        = isDark ? 'bg-zinc-950'   : 'bg-white';
  const border    = isDark ? 'border-zinc-800' : 'border-gray-200';
  const sidebarBg = isDark ? 'bg-zinc-900'   : 'bg-gray-50';
  const textMuted = isDark ? 'text-zinc-500'  : 'text-gray-400';
  const textPrimary = isDark ? 'text-zinc-200' : 'text-gray-800';
  const hoverBg   = isDark ? 'hover:bg-zinc-800' : 'hover:bg-gray-100';
  const activeConvBg = isDark ? 'bg-zinc-800 text-zinc-100' : 'bg-amber-50 text-amber-800';

  // ... (rest of the component unchanged: TasksPanel, ConvList, MobileConvDrawer, MobileTabBar, and main render)
  // For brevity I'm not repeating the whole render – but you already have it.
  // Make sure the <ChatPane>, <LeftPane>, and <Navbar> are unchanged.

  // (The complete render was provided in your original app.jsx – keep it as is.)

  // Return statement omitted for brevity – it stays exactly as you had.
}
