const { useState, useEffect, useRef } = React;

function App() {
  // ========== API Keys ==========
  const [rememberKeys, setRememberKeys] = useState(localStorage.getItem('REMEMBER_KEYS') === 'true');
  const keyStorage = rememberKeys ? localStorage : sessionStorage;

  const [openRouterKey, setOpenRouterKey] = useState(keyStorage.getItem('OR_KEY') || '');
  const [githubToken, setGithubToken] = useState(keyStorage.getItem('GH_TOKEN') || '');
  const [selectedModel, setSelectedModel] = useState(keyStorage.getItem('OR_MODEL') || 'openrouter/auto');
  const [deployHook, setDeployHook] = useState(keyStorage.getItem('DEPLOY_HOOK') || '');
  const [langSearchKey, setLangSearchKey] = useState(keyStorage.getItem('LS_KEY') || '');

  useEffect(() => { keyStorage.setItem('OR_KEY', openRouterKey); }, [openRouterKey]);
  useEffect(() => { keyStorage.setItem('GH_TOKEN', githubToken); }, [githubToken]);
  useEffect(() => { keyStorage.setItem('OR_MODEL', selectedModel); }, [selectedModel]);
  useEffect(() => { keyStorage.setItem('DEPLOY_HOOK', deployHook); }, [deployHook]);
  useEffect(() => { keyStorage.setItem('LS_KEY', langSearchKey); }, [langSearchKey]);
  useEffect(() => { localStorage.setItem('REMEMBER_KEYS', rememberKeys); }, [rememberKeys]);

  // ========== Workspace ==========
  const workspaceStorage = rememberKeys ? localStorage : sessionStorage;
  const [workspace, setWorkspace] = useState(workspaceStorage.getItem('WORKSPACE') || 'self');
  const [selfRepo, setSelfRepo] = useState(workspaceStorage.getItem('SELF_REPO') || '');
  const [selfBranch, setSelfBranch] = useState(workspaceStorage.getItem('SELF_BRANCH') || 'main');
  const [targetRepo, setTargetRepo] = useState(workspaceStorage.getItem('TARGET_REPO') || '');
  const [targetBranch, setTargetBranch] = useState(workspaceStorage.getItem('TARGET_BRANCH') || 'main');

  const currentRepo = workspace === 'self' ? selfRepo : targetRepo;
  const currentBranch = workspace === 'self' ? selfBranch : targetBranch;
  const setCurrentRepo = workspace === 'self' ? setSelfRepo : setTargetRepo;
  const setCurrentBranch = workspace === 'self' ? setSelfBranch : setTargetBranch;

  useEffect(() => {
    workspaceStorage.setItem('WORKSPACE', workspace);
    workspaceStorage.setItem('SELF_REPO', selfRepo);
    workspaceStorage.setItem('SELF_BRANCH', selfBranch);
    workspaceStorage.setItem('TARGET_REPO', targetRepo);
    workspaceStorage.setItem('TARGET_BRANCH', targetBranch);
  }, [workspace, selfRepo, selfBranch, targetRepo, targetBranch]);

  // ========== Local Chat ==========
  const [conversations, setConversations] = useState(() => {
    const saved = localStorage.getItem('LOCAL_CONVERSATIONS');
    return saved ? JSON.parse(saved) : [{ id: '1', title: 'Default', createdAt: Date.now() }];
  });
  const [activeConversationId, setActiveConversationId] = useState(() => {
    return localStorage.getItem('LOCAL_ACTIVE_CONV') || '1';
  });
  const [messages, setMessages] = useState(() => {
    const key = `LOCAL_MSGS_${localStorage.getItem('LOCAL_ACTIVE_CONV') || '1'}`;
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [{ role: 'assistant', content: 'Agent ready. Type `/help` for commands or describe your intent naturally.' }];
  });
  const [inputPrompt, setInputPrompt] = useState('');
  const [uploadedContext, setUploadedContext] = useState(null);
  const [streamingMessage, setStreamingMessage] = useState(''); // live streamed text
  const chatScrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { localStorage.setItem('LOCAL_CONVERSATIONS', JSON.stringify(conversations)); }, [conversations]);
  useEffect(() => {
    localStorage.setItem('LOCAL_ACTIVE_CONV', activeConversationId);
    const key = `LOCAL_MSGS_${activeConversationId}`;
    const saved = localStorage.getItem(key);
    if (saved) setMessages(JSON.parse(saved));
    else setMessages([{ role: 'assistant', content: 'New chat. Type `/help` for commands.' }]);
  }, [activeConversationId]);
  useEffect(() => {
    const key = `LOCAL_MSGS_${activeConversationId}`;
    localStorage.setItem(key, JSON.stringify(messages));
  }, [messages, activeConversationId]);

  const createNewConversation = () => {
    const id = Date.now().toString();
    setConversations(prev => [{ id, title: 'New Chat', createdAt: Date.now() }, ...prev]);
    setActiveConversationId(id);
  };
  const deleteConversation = (id) => {
    localStorage.removeItem(`LOCAL_MSGS_${id}`);
    setConversations(prev => {
      const rest = prev.filter(c => c.id !== id);
      if (activeConversationId === id) {
        if (rest.length > 0) setActiveConversationId(rest[0].id);
        else {
          const fresh = { id: Date.now().toString(), title: 'Default', createdAt: Date.now() };
          setActiveConversationId(fresh.id);
          return [fresh];
        }
      }
      return rest;
    });
  };

  // ========== Project Memory ==========
  const [projectMemory, setProjectMemory] = useState([]);
  useEffect(() => {
    if (currentRepo) {
      const saved = localStorage.getItem(`MEM_${currentRepo}`);
      setProjectMemory(saved ? JSON.parse(saved) : []);
    } else setProjectMemory([]);
  }, [currentRepo]);
  const addMemoryRule = (rule) => {
    const updated = [...projectMemory, rule];
    setProjectMemory(updated);
    localStorage.setItem(`MEM_${currentRepo}`, JSON.stringify(updated));
  };
  const clearMemory = () => {
    setProjectMemory([]);
    localStorage.setItem(`MEM_${currentRepo}`, JSON.stringify([]));
  };

  // ========== GitHub / Editor ==========
  const [fileTree, setFileTree] = useState([]);
  const [activeFilePath, setActiveFilePath] = useState('');
  const [activeFileContent, setActiveFileContent] = useState('');
  const [fileSha, setFileSha] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [toasts, setToasts] = useState([]);
  const [showCmdHints, setShowCmdHints] = useState(false);

  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, streamingMessage]);

  useEffect(() => {
    setShowCmdHints(inputPrompt.startsWith('/'));
  }, [inputPrompt]);

  const fetchFileTree = async () => {
    if (!currentRepo || !githubToken) return addToast('Missing repo or token', 'error');
    setIsLoading(true);
    try {
      const files = await window.GitHubService.fetchFileTree(currentRepo, currentBranch, githubToken);
      setFileTree(files);
      addToast('File tree updated', 'success');
    } catch (e) { addToast(e.message, 'error'); }
    finally { setIsLoading(false); }
  };

  const loadFile = async (path) => {
    setIsLoading(true);
    try {
      const { content, sha } = await window.GitHubService.loadFileContent(currentRepo, currentBranch, path, githubToken);
      setActiveFilePath(path); setActiveFileContent(content); setFileSha(sha); setActiveTab('editor');
    } catch (e) { addToast(e.message, 'error'); }
    finally { setIsLoading(false); }
  };

  const commitChange = async (customMessage) => {
    if (!activeFilePath) return addToast('No file', 'error');
    setIsLoading(true);
    try {
      const msg = customMessage || `Agent update: ${activeFilePath}`;
      const result = await window.GitHubService.commitFile(currentRepo, currentBranch, activeFilePath, activeFileContent, fileSha, msg, githubToken);
      setFileSha(result.content.sha);
      addToast('Committed!', 'success');
      fetchFileTree();
      if (workspace === 'self' && deployHook) {
        try { await fetch(deployHook, { method: 'POST' }); addToast('Redeploy triggered!', 'success'); }
        catch { addToast('Deploy hook failed', 'error'); }
      }
    } catch (e) { addToast(e.message, 'error'); }
    finally { setIsLoading(false); }
  };

  const handleCreateBranch = async (branchName) => {
    try {
      await window.GitHubService.createBranch(currentRepo, currentBranch, branchName, githubToken);
      setCurrentBranch(branchName); addToast(`Branch ${branchName} created`, 'success'); fetchFileTree(); return true;
    } catch (e) { addToast(e.message, 'error'); return false; }
  };
  const handleSwitchBranch = async (branch) => {
    if (!await window.GitHubService.branchExists(currentRepo, branch, githubToken)) { addToast('Branch not found', 'error'); return; }
    setCurrentBranch(branch); setFileTree([]); setActiveFilePath(''); setActiveFileContent(''); setFileSha('');
    fetchFileTree(); addToast(`Switched to ${branch}`, 'success');
  };
  const handleCreatePR = async (title, base) => {
    try { const pr = await window.GitHubService.createPullRequest(currentRepo, currentBranch, title, base, githubToken); addToast('PR created', 'success'); return pr.html_url; }
    catch (e) { addToast(e.message, 'error'); return null; }
  };

  // ========== Orchestrator State ==========
  const [orchestratorTasks, setOrchestratorTasks] = useState([]);
  const refreshTasks = async () => {
    const oState = window.Orchestrator.getState();
    if (oState.milestone) {
      const tasks = await window.TaskManager.getTasksByMilestone(currentRepo, oState.milestone.number, githubToken);
      setOrchestratorTasks(tasks);
    }
  };

  // ========== Slash Command Execution ==========
  const executeSlashCommand = async (cmd, args, userText) => {
    switch (cmd) {
      case '/help':
        setMessages(prev => [...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: `**Available Commands:**\n${window.COMMANDS.map(c => `\`${c.cmd}\` — ${c.desc}`).join('\n')}\n\n💡 You can also describe your intent naturally, e.g. *"search for React hooks"* or *"commit this file"*.` }
        ]);
        return true;
      case '/clear':
        setMessages([{ role: 'assistant', content: 'Chat cleared.' }]);
        return true;
      case '/fetch':
        fetchFileTree();
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        return true;
      case '/commit':
        commitChange(args || null);
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        return true;
      case '/learn':
        if (!args) addToast('Provide rule', 'error');
        else { addMemoryRule(args); setMessages(prev => [...prev, { role: 'user', content: userText }, { role: 'assistant', content: `🧠 Learned: ${args}` }]); }
        return true;
      case '/forget':
        clearMemory();
        setMessages(prev => [...prev, { role: 'user', content: userText }, { role: 'assistant', content: 'Memory cleared.' }]);
        return true;
      case '/branch': {
        if (!args) { addToast('Specify branch name', 'error'); return true; }
        const success = await handleCreateBranch(args);
        setMessages(prev => [...prev, { role: 'user', content: userText }, { role: 'assistant', content: success ? `✅ Branch **${args}** created.` : `❌ Failed` }]);
        return true;
      }
      case '/pr': {
        const parts = args.split(' ');
        const title = parts[0]?.replace(/"/g, '') || '';
        const base = parts[1] || null;
        if (!title) { addToast('Provide PR title', 'error'); return true; }
        const url = await handleCreatePR(title, base);
        setMessages(prev => [...prev, { role: 'user', content: userText }, { role: 'assistant', content: url ? `🔀 PR opened: ${url}` : '❌ PR failed' }]);
        return true;
      }
      case '/switch': {
        if (!args) { addToast('Specify branch', 'error'); return true; }
        await handleSwitchBranch(args);
        setMessages(prev => [...prev, { role: 'user', content: userText }, { role: 'assistant', content: `🌿 Switched to **${args}**.` }]);
        return true;
      }
      case '/search': {
        if (!args) { addToast('Enter a search query.', 'error'); return true; }
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        setIsLoading(true);
        addToast('🔍 Searching…', 'info');
        try {
          const results = await window.WebSearchService.search(args, { langSearchKey, openRouterKey, model: selectedModel, count: 6 });
          // Rich message with structured results data
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: results.length === 0 ? 'No results found.' : `Found ${results.length} results for "${args}"`,
            searchResults: results,
            searchQuery: args
          }]);
          addToast(`${results.length} results`, 'success');
        } catch (e) {
          addToast(e.message, 'error');
          setMessages(prev => [...prev, { role: 'assistant', content: `❌ Search failed: ${e.message}` }]);
        } finally {
          setIsLoading(false);
        }
        return true;
      }
      case '/plan': {
        if (!args) { addToast('Provide a goal for the plan.', 'error'); return true; }
        await window.Orchestrator.runPlanPhase({
          goal: args, repo: currentRepo, branch: currentBranch,
          githubToken, openRouterKey, model: selectedModel,
          fileTree, addToast, setMessages
        });
        refreshTasks();
        return true;
      }
      case '/execute': {
        await window.Orchestrator.runExecutePhase({
          repo: currentRepo, branch: currentBranch,
          githubToken, openRouterKey, model: selectedModel,
          projectMemory, addToast, setMessages,
          setActiveFileContent, setActiveFilePath, setActiveTab
        });
        refreshTasks();
        return true;
      }
      case '/review': {
        await window.Orchestrator.runReviewPhase({
          repo: currentRepo, branch: currentBranch,
          githubToken, openRouterKey, model: selectedModel,
          fileTree, addToast, setMessages
        });
        refreshTasks();
        return true;
      }
      case '/autopilot':
        window.Orchestrator.setMode('autopilot');
        setMessages(prev => [...prev, { role: 'user', content: userText }, { role: 'assistant', content: '🤖 **Autopilot enabled.** Running plan → execute → review without pausing. Use `/manual` to stop.' }]);
        return true;
      case '/manual':
        window.Orchestrator.setMode('manual');
        setMessages(prev => [...prev, { role: 'user', content: userText }, { role: 'assistant', content: '🖐 **Manual mode.** Confirming at each step.' }]);
        return true;
      case '/tasks': {
        await refreshTasks();
        const oState = window.Orchestrator.getState();
        setMessages(prev => [...prev, { role: 'user', content: userText }, {
          role: 'assistant',
          content: orchestratorTasks.length === 0
            ? 'No active tasks. Use `/plan <goal>` to create a task list.'
            : `📋 **Tasks** (Milestone: ${oState.milestone?.title || 'N/A'})\nSwitching to Task Board…`
        }]);
        setActiveTab('tasks');
        return true;
      }
      default: return false;
    }
  };

  // ========== AI Chat with Streaming ==========
  const sendMessage = async (overrideText) => {
    const userText = (overrideText || inputPrompt).trim();
    if (!userText) return;
    setInputPrompt('');

    // Check for slash commands first
    if (userText.startsWith('/')) {
      const parts = userText.trim().split(' ');
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ');
      if (await executeSlashCommand(cmd, args, userText)) return;
    }

    // Intent detection: convert natural language to slash commands
    if (window.IntentDetector) {
      const intent = window.IntentDetector.detect(userText);
      if (intent && intent.confidence >= 0.85) {
        const full = intent.args ? `${intent.cmd} ${intent.args}` : intent.cmd;
        const parts = full.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1).join(' ');
        if (await executeSlashCommand(cmd, args, userText)) return;
      }
    }

    // Standard AI chat with simulated streaming
    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setIsLoading(true);
    setStreamingMessage('');

    const memoryStr = projectMemory.length
      ? '\nPROJECT MEMORY:\n' + projectMemory.map((m, i) => `${i + 1}. ${m}`).join('\n')
      : '';

    const sysPrompt = `You are an autonomous coding agent. Current repo: ${currentRepo} (branch: ${currentBranch}). Active file: ${activeFilePath}.\nContent:\n\`\`\`\n${activeFileContent}\n\`\`\`${memoryStr}\nYou can use: <skill name="update_editor">NEW_CODE</skill> to overwrite active file, <skill name="read_file" path="..."/> to request a file load.`;

    let userContent = userText;
    if (uploadedContext) {
      if (uploadedContext.type === 'image') {
        userContent = [{ type: 'text', text: userText }, { type: 'image_url', image_url: { url: uploadedContext.data } }];
      } else {
        userContent = `${userText}\n\nAttached: ${uploadedContext.name}\n${uploadedContext.data}`;
      }
    }

    try {
      await window.OpenRouterService.chatCompletionStream({
        messages: newMessages,
        model: selectedModel,
        apiKey: openRouterKey,
        systemPrompt: sysPrompt,
        userContent,
        onToken: (token, accumulated) => {
          setStreamingMessage(accumulated);
        },
        onDone: (fullContent, usedModel) => {
          const { modifiedReply, actions } = window.processAgentSkills(fullContent);
          if (actions.updateEditorContent) {
            setActiveFileContent(actions.updateEditorContent);
            addToast('Agent updated editor', 'success');
            setActiveTab('editor');
          }
          setMessages(prev => [...prev, { role: 'assistant', content: modifiedReply, model: usedModel }]);
          setStreamingMessage('');
          setUploadedContext(null);
          setIsLoading(false);
        },
        onError: (e) => {
          addToast(e.message, 'error');
          setMessages(prev => [...prev, { role: 'assistant', content: `*Error: ${e.message}*` }]);
          setStreamingMessage('');
          setIsLoading(false);
        }
      });
    } catch (e) {
      addToast(e.message, 'error');
      setMessages(prev => [...prev, { role: 'assistant', content: `*Error: ${e.message}*` }]);
      setStreamingMessage('');
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setUploadedContext({
      type: file.type.startsWith('image/') ? 'image' : 'text',
      data: ev.target.result,
      name: file.name
    });
    file.type.startsWith('image/') ? reader.readAsDataURL(file) : reader.readAsText(file);
  };

  // ========== Render ==========
  return React.createElement('div', { className: 'flex flex-col h-screen bg-zinc-950 text-zinc-200' },

    // Toasts
    React.createElement('div', { className: 'fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none' },
      toasts.map(t => React.createElement('div', {
        key: t.id,
        className: `px-4 py-3 rounded-xl shadow-xl border text-sm max-w-sm pointer-events-auto animate-in slide-in-from-top-2 ${
          t.type === 'error' ? 'bg-red-950/95 border-red-800 text-red-200' :
          t.type === 'success' ? 'bg-green-950/95 border-green-800 text-green-200' :
          t.type === 'warning' ? 'bg-yellow-950/95 border-yellow-800 text-yellow-200' :
          'bg-zinc-800/95 border-zinc-700 text-zinc-200'
        }`
      }, t.message))
    ),

    React.createElement(window.Navbar, {
      workspace, setWorkspace,
      currentRepo, setCurrentRepo,
      currentBranch, setCurrentBranch,
      githubToken, setGithubToken,
      selectedModel, setSelectedModel,
      deployHook, setDeployHook,
      onFetchFileTree: fetchFileTree,
      isLoading,
      rememberKeys, setRememberKeys,
      activeTab, setActiveTab,
    }),

    React.createElement('div', { className: 'flex-1 flex overflow-hidden' },

      // Conversation sidebar
      React.createElement('div', { className: 'w-48 lg:w-52 bg-zinc-950 border-r border-zinc-900 flex flex-col shrink-0' },
        React.createElement('div', { className: 'p-2 border-b border-zinc-900 flex items-center justify-between' },
          React.createElement('span', { className: 'font-bold text-[10px] uppercase text-zinc-600 tracking-widest' }, 'Chats'),
          React.createElement('button', {
            onClick: createNewConversation,
            className: 'text-[10px] bg-amber-600 hover:bg-amber-500 text-zinc-950 px-2 py-1 rounded-md font-bold transition'
          }, '+ New')
        ),
        React.createElement('div', { className: 'flex-1 overflow-y-auto custom-scrollbar' },
          conversations.map(conv =>
            React.createElement('div', {
              key: conv.id,
              onClick: () => setActiveConversationId(conv.id),
              className: `group flex items-center justify-between px-3 py-2.5 cursor-pointer transition ${
                conv.id === activeConversationId ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
              }`
            },
              React.createElement('span', { className: 'text-xs truncate flex-1' }, conv.title),
              React.createElement('button', {
                onClick: e => { e.stopPropagation(); deleteConversation(conv.id); },
                className: 'opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 ml-1 text-base leading-none transition'
              }, '×')
            )
          )
        )
      ),

      // Main content area
      React.createElement('div', { className: 'flex-1 flex overflow-hidden' },

        (activeTab === 'tree' || activeTab === 'memory') && React.createElement(window.LeftPane, {
          memory: projectMemory, fileTree, activeFilePath, onFileClick: loadFile
        }),

        activeTab === 'editor' && React.createElement(window.EditorPane, {
          filePath: activeFilePath, content: activeFileContent,
          onChange: setActiveFileContent, onCommit: () => commitChange(),
          isLoading, activeRepo: currentRepo, activeBranch: currentBranch
        }),

        activeTab === 'tasks' && React.createElement(window.TaskBoard, {
          tasks: orchestratorTasks, onRefresh: refreshTasks, isLoading
        }),

        activeTab === 'chat' && React.createElement(window.ChatPane, {
          messages, inputPrompt, setInputPrompt,
          uploadedContext, setUploadedContext,
          isLoading, onSend: sendMessage, onFileUpload: handleFileUpload,
          showCmdHints,
          onCmdHintClick: (cmd) => {
            setInputPrompt(cmd + ' ');
            if (inputRef.current) inputRef.current.focus();
          },
          chatScrollRef, inputRef,
          streamingMessage,
        })
      )
    )
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
