const { useState, useEffect, useRef } = React;

function App() {
  // ========== Provider ==========
  const [provider, setProvider] = useState(
    localStorage.getItem('PROVIDER') || 'deepseek'
  );
  const [thinkingMode, setThinkingMode] = useState(
    localStorage.getItem('THINKING_MODE') === 'true'
  );
  const [reasoningEffort, setReasoningEffort] = useState(
    localStorage.getItem('REASONING_EFFORT') || 'high'
  );

  useEffect(() => { localStorage.setItem('PROVIDER', provider); }, [provider]);
  useEffect(() => { localStorage.setItem('THINKING_MODE', thinkingMode); }, [thinkingMode]);
  useEffect(() => { localStorage.setItem('REASONING_EFFORT', reasoningEffort); }, [reasoningEffort]);

  // ========== API Keys (must be defined before defaultModel) ==========
  const [rememberKeys, setRememberKeys] = useState(localStorage.getItem('REMEMBER_KEYS') === 'true');
  const keyStorage = rememberKeys ? localStorage : sessionStorage;

  // ========== Models ==========
  const DEEPSEEK_MODELS = [
    { value: 'deepseek-v4-flash', label: 'DeepSeek Flash (Fast)' },
    { value: 'deepseek-v4-pro',   label: 'DeepSeek Pro (Powerful)' },
  ];

  const [openRouterModels, setOpenRouterModels] = useState(
    window.ModelRegistry ? window.ModelRegistry.FALLBACK_MODELS : []
  );
  const [modelsLoading, setModelsLoading] = useState(false);

  useEffect(() => {
    if (provider === 'openrouter') {
      setModelsLoading(true);
      window.ModelRegistry.fetchModels().then(m => {
        setOpenRouterModels(m);
        setModelsLoading(false);
      });
    }
  }, [provider]);

  // Current model list and default
  const models = provider === 'deepseek' ? DEEPSEEK_MODELS : openRouterModels;
  const defaultModel = provider === 'deepseek'
    ? (keyStorage.getItem('OR_MODEL') && DEEPSEEK_MODELS.some(m => m.value === keyStorage.getItem('OR_MODEL'))
        ? keyStorage.getItem('OR_MODEL')
        : 'deepseek-v4-flash')
    : (keyStorage.getItem('OR_MODEL') || 'openrouter/auto');

  const [githubToken, setGithubToken] = useState(keyStorage.getItem('GH_TOKEN') || '');
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [deployHook, setDeployHook] = useState(keyStorage.getItem('DEPLOY_HOOK') || '');

  useEffect(() => { keyStorage.setItem('GH_TOKEN', githubToken); }, [githubToken]);
  useEffect(() => { keyStorage.setItem('OR_MODEL', selectedModel); }, [selectedModel]);
  useEffect(() => { keyStorage.setItem('DEPLOY_HOOK', deployHook); }, [deployHook]);
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

  // ========== Customisation ==========
  const [systemPromptOverride, setSystemPromptOverride] = useState(
    keyStorage.getItem('SYSPROMPT') || ''
  );
  useEffect(() => { keyStorage.setItem('SYSPROMPT', systemPromptOverride); }, [systemPromptOverride]);

  // ========== User Memory ==========
  const [userMemory, setUserMemory] = useState(() => {
    const saved = localStorage.getItem('USER_MEMORY');
    return saved ? JSON.parse(saved) : [];
  });
  useEffect(() => {
    localStorage.setItem('USER_MEMORY', JSON.stringify(userMemory));
  }, [userMemory]);

  // ========== Chat State ==========
  const [conversations, setConversations] = useState(() => {
    const saved = localStorage.getItem('LOCAL_CONVERSATIONS');
    return saved ? JSON.parse(saved) : [{ id: '1', title: 'Default', createdAt: Date.now() }];
  });
  const [activeConversationId, setActiveConversationId] = useState(
    () => localStorage.getItem('LOCAL_ACTIVE_CONV') || '1'
  );
  const [messages, setMessages] = useState(() => {
    const key = `LOCAL_MSGS_${localStorage.getItem('LOCAL_ACTIVE_CONV') || '1'}`;
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [{ role: 'assistant', content: 'Agent ready. Type `/help` for commands or describe your intent naturally.' }];
  });
  const [inputPrompt, setInputPrompt] = useState('');
  const [uploadedContext, setUploadedContext] = useState(null);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState(null);
  const chatScrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { localStorage.setItem('LOCAL_CONVERSATIONS', JSON.stringify(conversations)); }, [conversations]);
  useEffect(() => {
    localStorage.setItem('LOCAL_ACTIVE_CONV', activeConversationId);
    const saved = localStorage.getItem(`LOCAL_MSGS_${activeConversationId}`);
    if (saved) setMessages(JSON.parse(saved));
    else setMessages([{ role: 'assistant', content: 'New chat. Type `/help` for commands.' }]);
    const existingSummary = window.SummaryService.getSummary(activeConversationId);
    if (!existingSummary && messages.length > 0) {
      window.SummaryService.maybeSummarise(activeConversationId, messages, 'manual');
    }
  }, [activeConversationId]);
  useEffect(() => {
    localStorage.setItem(`LOCAL_MSGS_${activeConversationId}`, JSON.stringify(messages));
  }, [messages, activeConversationId]);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages, streamingMessage]);

  const createNewConversation = () => {
    const id = Date.now().toString();
    setConversations(prev => [{ id, title: 'New Chat', createdAt: Date.now() }, ...prev]);
    setActiveConversationId(id);
  };
  const deleteConversation = (id) => {
    localStorage.removeItem(`LOCAL_MSGS_${id}`);
    window.SummaryService.deleteSummary(id);
    setConversations(prev => {
      const rest = prev.filter(c => c.id !== id);
      if (activeConversationId === id) {
        const next = rest[0] || { id: Date.now().toString(), title: 'Default', createdAt: Date.now() };
        setActiveConversationId(next.id);
        if (rest.length === 0) return [next];
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

  useEffect(() => { setShowCmdHints(inputPrompt.startsWith('/')); }, [inputPrompt]);

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
    try { await window.GitHubService.createBranch(currentRepo, currentBranch, branchName, githubToken); setCurrentBranch(branchName); addToast(`Branch ${branchName} created`, 'success'); fetchFileTree(); return true; }
    catch (e) { addToast(e.message, 'error'); return false; }
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

  // ========== Orchestrator ==========
  const [orchestratorTasks, setOrchestratorTasks] = useState([]);
  const refreshTasks = async () => {
    const oState = window.Orchestrator.getState();
    if (oState.milestone) {
      const tasks = await window.TaskManager.getTasksByMilestone(currentRepo, oState.milestone.number, githubToken);
      setOrchestratorTasks(tasks);
    }
  };

  // ========== AI Search Synthesis ==========
  const getSynthesisModel = () => {
    if (provider === 'deepseek') return selectedModel;
    const freeModels = openRouterModels.filter(m => m.free && m.value !== 'openrouter/auto');
    const preferred = ['llama-3.3-70b', 'gemini-2.0-flash', 'qwen-2.5-72b', 'deepseek-r1'];
    for (const pref of preferred) {
      const match = freeModels.find(m => m.value.includes(pref));
      if (match) return match.value;
    }
    return freeModels[0]?.value || 'openrouter/auto';
  };

  const synthesiseSearchResults = async (query, results) => {
    const context = window.WebSearchService.formatForAI(results);
    const sysPrompt = `You are a helpful research assistant. Given web search results, write a concise, accurate synthesis of the key information relevant to the query. Be direct and informative. Use markdown for formatting. Keep it under 150 words.`;
    const userContent = `Query: "${query}"\n\nSearch results:\n${context}\n\nWrite a concise synthesis.`;
    try {
      const synthesisModel = getSynthesisModel();
      const result = await window.LLMProvider.chatCompletion({
        provider,
        model: synthesisModel,
        messages: [],
        systemPrompt: sysPrompt,
        userContent,
        thinkingMode: false,
      });
      return result.content;
    } catch {
      return null;
    }
  };

  // ========== Slash Commands ==========
  const executeSlashCommand = async (cmd, args, userText) => {
    switch (cmd) {
      case '/help':
        setMessages(prev => [...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: `**Available Commands:**\n${window.COMMANDS.map(c => `\`${c.cmd}\` — ${c.desc}`).join('\n')}\n\n💡 You can also describe intent naturally: *"search for X"*, *"commit this"*, *"create branch feature/x"*.` }
        ]);
        await window.SummaryService.maybeSummarise(activeConversationId, [...messages, { role: 'user', content: userText }], 'command');
        return true;
      case '/rollback':
        await window.GitHubService.resetBranch(currentRepo, currentBranch, 'main', githubToken);
        addToast('Branch reset to main', 'success');
        await fetchFileTree();
        setMessages(prev => [...prev, { role: 'assistant', content: '↩️ Branch reset to main.' }]);
        return true;
      case '/clear':
        setMessages([{ role: 'assistant', content: 'Chat cleared.' }]);
        await window.SummaryService.maybeSummarise(activeConversationId, [{ role: 'assistant', content: 'Chat cleared.' }], 'command');
        return true;
      case '/fetch':
        fetchFileTree();
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        await window.SummaryService.maybeSummarise(activeConversationId, [...messages, { role: 'user', content: userText }], 'command');
        return true;
      case '/commit':
        commitChange(args || null);
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        await window.SummaryService.maybeSummarise(activeConversationId, [...messages, { role: 'user', content: userText }], 'command');
        return true;
      case '/learn':
        if (!args) { addToast('Provide rule', 'error'); return true; }
        addMemoryRule(args);
        const newMessagesLearn = [...messages, { role: 'user', content: userText }, { role: 'assistant', content: `🧠 Learned: ${args}` }];
        setMessages(newMessagesLearn);
        await window.SummaryService.maybeSummarise(activeConversationId, newMessagesLearn, 'command');
        return true;
      case '/forget':
        clearMemory();
        const newMessagesForget = [...messages, { role: 'user', content: userText }, { role: 'assistant', content: 'Memory cleared.' }];
        setMessages(newMessagesForget);
        await window.SummaryService.maybeSummarise(activeConversationId, newMessagesForget, 'command');
        return true;
      case '/branch': {
        if (!args) { addToast('Specify branch name', 'error'); return true; }
        const success = await handleCreateBranch(args);
        const newMessagesBranch = [...messages, { role: 'user', content: userText }, { role: 'assistant', content: success ? `✅ Branch **${args}** created.` : `❌ Failed` }];
        setMessages(newMessagesBranch);
        await window.SummaryService.maybeSummarise(activeConversationId, newMessagesBranch, 'command');
        return true;
      }
      case '/pr': {
        const parts = args.split(' ');
        const title = parts[0]?.replace(/"/g, '') || '';
        const base = parts[1] || null;
        if (!title) { addToast('Provide PR title', 'error'); return true; }
        const url = await handleCreatePR(title, base);
        const newMessagesPR = [...messages, { role: 'user', content: userText }, { role: 'assistant', content: url ? `🔀 PR opened: ${url}` : '❌ PR failed' }];
        setMessages(newMessagesPR);
        await window.SummaryService.maybeSummarise(activeConversationId, newMessagesPR, 'command');
        return true;
      }
      case '/switch': {
        if (!args) { addToast('Specify branch', 'error'); return true; }
        await handleSwitchBranch(args);
        const newMessagesSwitch = [...messages, { role: 'user', content: userText }, { role: 'assistant', content: `🌿 Switched to **${args}**.` }];
        setMessages(newMessagesSwitch);
        await window.SummaryService.maybeSummarise(activeConversationId, newMessagesSwitch, 'command');
        return true;
      }
      case '/search': {
        if (!args) { addToast('Enter a search query.', 'error'); return true; }
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        setIsLoading(true);
        addToast('🔍 Searching…', 'info');
        try {
          const results = await window.WebSearchService.search(args, { count: 6 });
          if (results.length === 0) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'No results found.' }]);
          } else {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `Found ${results.length} results`,
              searchResults: results,
              searchQuery: args,
              synthesis: null,
            }]);
            addToast(`${results.length} results · synthesising…`, 'info');
            const synthesis = await synthesiseSearchResults(args, results);
            if (synthesis) {
              setMessages(prev => {
                const updated = [...prev];
                const idx = updated.findLastIndex(m => m.searchQuery === args);
                if (idx !== -1) updated[idx] = { ...updated[idx], synthesis };
                return updated;
              });
            }
          }
          addToast('Search complete', 'success');
        } catch (e) {
          addToast(e.message, 'error');
          setMessages(prev => [...prev, { role: 'assistant', content: `❌ Search failed: ${e.message}` }]);
        } finally {
          setIsLoading(false);
          await window.SummaryService.maybeSummarise(activeConversationId, messages, 'command');
        }
        return true;
      }
      case '/plan': {
        if (!args) { addToast('Provide a goal.', 'error'); return true; }
        await window.Orchestrator.runPlanPhase({ goal: args, repo: currentRepo, branch: currentBranch, githubToken, provider, model: selectedModel, thinkingMode, reasoningEffort, fileTree, addToast, setMessages, projectMemory, userMemory, systemPromptOverride });
        refreshTasks();
        await window.SummaryService.maybeSummarise(activeConversationId, messages, 'command');
        return true;
      }
      case '/rollback':
  if (!currentRepo || !githubToken) {
    addToast('Missing repo or token', 'error');
    return true;
  }
  try {
    await window.GitHubService.resetBranch(currentRepo, currentBranch, 'main', githubToken);
    addToast('Branch reset to main', 'success');
    await fetchFileTree();
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '↩️ Branch has been reset to `main`. All uncommitted changes on this branch are lost.'
    }]);
  } catch (e) {
    addToast(e.message, 'error');
  }
  return true;

case '/self-improve':
  if (!args) { addToast('Describe what to improve.', 'error'); return true; }
  if (window.selfImproveRunning) {
    addToast('Self‑improvement already in progress. Wait or refresh.', 'warning');
    return true;
  }
  window.selfImproveRunning = true;

  const slug = args.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const newBranch = `self-improve/${Date.now()}-${slug}`;
  const originalRepo = currentRepo;
  const originalBranch = currentBranch;

  setMessages(prev => [...prev, { role: 'user', content: `/self-improve ${args}` }]);

  try {
    addToast(`🌿 Creating branch ${newBranch}...`, 'info');
    await window.GitHubService.createBranch(originalRepo, 'main', newBranch, githubToken);
    
    // Switch UI to new branch
    setCurrentBranch(newBranch);
    await new Promise(r => setTimeout(r, 500));
    await fetchFileTree();

    // Store original orchestration mode, enable autopilot
    const prevMode = window.Orchestrator.getState().mode;
    window.Orchestrator.setMode('autopilot');

    // Plan
    addToast('📋 Planning...', 'info');
    const planResult = await window.Orchestrator.runPlanPhase({
      goal: args, repo: originalRepo, branch: newBranch, githubToken,
      provider, model: selectedModel, thinkingMode, reasoningEffort,
      fileTree, addToast, setMessages,
      projectMemory, userMemory, systemPromptOverride
    });
    if (planResult?.error) throw new Error(planResult.message);

    // Execute
    addToast('🔨 Executing tasks...', 'info');
    await window.Orchestrator.runExecutePhase({
      repo: originalRepo, branch: newBranch, githubToken,
      provider, model: selectedModel, thinkingMode, reasoningEffort,
      projectMemory, userMemory, systemPromptOverride,
      addToast, setMessages,
      setActiveFileContent, setActiveFilePath, setActiveTab
    });

    // Review
    addToast('🔍 Reviewing changes...', 'info');
    await window.Orchestrator.runReviewPhase({
      repo: originalRepo, branch: newBranch, githubToken,
      provider, model: selectedModel, thinkingMode, reasoningEffort,
      fileTree, addToast, setMessages,
      projectMemory, userMemory, systemPromptOverride
    });

    window.Orchestrator.setMode(prevMode);

    // Open Pull Request
    const prTitle = `Self‑improve: ${args.slice(0, 60)}`;
    const pr = await window.GitHubService.createPullRequest(
      originalRepo, newBranch, prTitle, 'main', githubToken
    );

    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `✅ **Self‑improvement complete**\n🔀 Pull Request: ${pr.html_url}\n🌐 Netlify preview will be ready in ~2 minutes (no password needed).\n\nMerge after testing.`
    }]);
    addToast(`PR opened: ${pr.html_url}`, 'success');

  } catch (err) {
    addToast(`Self‑improve failed: ${err.message}`, 'error');
    setMessages(prev => [...prev, { role: 'assistant', content: `❌ Failed: ${err.message}` }]);
  } finally {
    // Restore original branch in UI
    setCurrentBranch(originalBranch);
    await fetchFileTree();
    window.selfImproveRunning = false;
  }
  return true;
      case '/execute': {
        await window.Orchestrator.runExecutePhase({ repo: currentRepo, branch: currentBranch, githubToken, provider, model: selectedModel, thinkingMode, reasoningEffort, projectMemory, userMemory, systemPromptOverride, addToast, setMessages, setActiveFileContent, setActiveFilePath, setActiveTab });
        refreshTasks();
        await window.SummaryService.maybeSummarise(activeConversationId, messages, 'command');
        return true;
      }
      case '/review': {
        await window.Orchestrator.runReviewPhase({ repo: currentRepo, branch: currentBranch, githubToken, provider, model: selectedModel, thinkingMode, reasoningEffort, fileTree, addToast, setMessages, projectMemory, userMemory, systemPromptOverride });
        refreshTasks();
        await window.SummaryService.maybeSummarise(activeConversationId, messages, 'command');
        return true;
      }
      case '/autopilot':
        window.Orchestrator.setMode('autopilot');
        const newMessagesAuto = [...messages, { role: 'user', content: userText }, { role: 'assistant', content: '🤖 **Autopilot enabled.** Running plan → execute → review loop. Use `/manual` to stop.' }];
        setMessages(newMessagesAuto);
        await window.SummaryService.maybeSummarise(activeConversationId, newMessagesAuto, 'command');
        return true;
      case '/manual':
        window.Orchestrator.setMode('manual');
        const newMessagesManual = [...messages, { role: 'user', content: userText }, { role: 'assistant', content: '🖐 **Manual mode.** Confirming at each step.' }];
        setMessages(newMessagesManual);
        await window.SummaryService.maybeSummarise(activeConversationId, newMessagesManual, 'command');
        return true;
      case '/tasks': {
        await refreshTasks();
        const oState = window.Orchestrator.getState();
        const newMessagesTasks = [...messages, { role: 'user', content: userText }, {
          role: 'assistant',
          content: orchestratorTasks.length === 0 ? 'No active tasks. Use `/plan <goal>` first.' : `📋 **Tasks** (${oState.milestone?.title || 'N/A'})\nOpening Task Board…`
        }];
        setMessages(newMessagesTasks);
        setActiveTab('tasks');
        await window.SummaryService.maybeSummarise(activeConversationId, newMessagesTasks, 'command');
        return true;
      }
      case '/remember':
        if (!args) { addToast('Provide a preference to remember', 'error'); return true; }
        setUserMemory(prev => [...prev, args]);
        const newMessagesRemember = [...messages, { role: 'user', content: userText }, { role: 'assistant', content: `🧠 I'll remember: *${args}*` }];
        setMessages(newMessagesRemember);
        await window.SummaryService.maybeSummarise(activeConversationId, newMessagesRemember, 'command');
        return true;
      case '/forgetme':
        setUserMemory([]);
        const newMessagesForgetMe = [...messages, { role: 'user', content: userText }, { role: 'assistant', content: 'All personal preferences cleared.' }];
        setMessages(newMessagesForgetMe);
        await window.SummaryService.maybeSummarise(activeConversationId, newMessagesForgetMe, 'command');
        return true;
      case '/myprefs':
        const newMessagesPrefs = [...messages, { role: 'user', content: userText }, {
          role: 'assistant', content: userMemory.length === 0
            ? 'No personal preferences saved yet.'
            : `🧠 **Your preferences:**\n${userMemory.map((p, i) => `${i+1}. ${p}`).join('\n')}`
        }];
        setMessages(newMessagesPrefs);
        await window.SummaryService.maybeSummarise(activeConversationId, newMessagesPrefs, 'command');
        return true;
      default: return false;
    }
  };

  // ========== AI Chat with Streaming ==========
  const sendMessage = async (overrideText) => {
    const userText = (overrideText || inputPrompt).trim();
    if (!userText) return;
    setInputPrompt('');

    if (userText.startsWith('/')) {
      const parts = userText.split(' ');
      if (await executeSlashCommand(parts[0].toLowerCase(), parts.slice(1).join(' '), userText)) return;
    }

    if (window.IntentDetector) {
      const intent = window.IntentDetector.detect(userText);
      if (intent && intent.confidence >= 0.85) {
        const full = intent.args ? `${intent.cmd} ${intent.args}` : intent.cmd;
        const parts = full.split(' ');
        if (await executeSlashCommand(parts[0], parts.slice(1).join(' '), userText)) return;
      }
    }

    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    await window.SummaryService.maybeSummarise(activeConversationId, newMessages, 'auto');
    setIsLoading(true);
    setStreamingMessage('');
    setStreamingReasoning(null);

    const memoryStr = projectMemory.length ? '\nPROJECT MEMORY:\n' + projectMemory.map((m, i) => `${i+1}. ${m}`).join('\n') : '';
    let sysPrompt = `You are an autonomous coding agent. Repo: ${currentRepo} (branch: ${currentBranch}). Active file: ${activeFilePath}.\nContent:\n\`\`\`\n${activeFileContent}\n\`\`\`${memoryStr}\nUse <skill name="update_editor">CODE</skill> to update the active file. Use <skill name="read_file" path="..."/> to request a file.`;

    if (systemPromptOverride.trim()) {
      sysPrompt = systemPromptOverride + '\n\n' + sysPrompt;
    }

    const contextForRelevance = userText + ' ' + messages.slice(-2).map(m => m.content).join(' ');
    const relevantPrefs = window.ContextMatcher.selectRelevant(userMemory, contextForRelevance, 3);
    const userMemoryStr = relevantPrefs.length
      ? '\n\nRELEVANT USER PREFERENCES (adhere to these):\n' + relevantPrefs.map((p, i) => `${i+1}. ${p}`).join('\n')
      : '';
    sysPrompt += userMemoryStr;

    let userContent = userText;
    if (uploadedContext) {
      userContent = uploadedContext.type === 'image'
        ? [{ type: 'text', text: userText }, { type: 'image_url', image_url: { url: uploadedContext.data } }]
        : `${userText}\n\nAttached: ${uploadedContext.name}\n${uploadedContext.data}`;
    }

    try {
      await window.LLMProvider.chatCompletionStream({
        provider,
        model: selectedModel,
        messages: newMessages,
        systemPrompt: sysPrompt,
        userContent,
        thinkingMode,
        reasoningEffort,
        onToken: (_, accumulated) => setStreamingMessage(accumulated),
        onDone: async (fullContent, usedModel, reasoning) => {
          try {
            const { modifiedReply, actions } = window.processAgentSkills(fullContent || '');
            if (actions.updateEditorContent) {
              setActiveFileContent(actions.updateEditorContent);
              addToast('Agent updated editor', 'success');
              setActiveTab('editor');
            }
            const finalMessages = [...newMessages, { role: 'assistant', content: modifiedReply, model: usedModel, reasoning_content: reasoning }];
            setMessages(finalMessages);
            await window.SummaryService.maybeSummarise(activeConversationId, finalMessages, 'command');
          } catch (err) {
            console.error('processAgentSkills error:', err);
            addToast('Error processing response', 'error');
            const errorMessages = [...newMessages, { role: 'assistant', content: fullContent || '(no content)', model: usedModel }];
            setMessages(errorMessages);
            await window.SummaryService.maybeSummarise(activeConversationId, errorMessages, 'command');
          } finally {
            setStreamingMessage('');
            setStreamingReasoning(null);
            setUploadedContext(null);
            setIsLoading(false);
          }
        },
        onError: (e) => {
          addToast(e.message, 'error');
          setMessages(prev => [...prev, { role: 'assistant', content: `*Error: ${e.message}*` }]);
          setStreamingMessage('');
          setStreamingReasoning(null);
          setIsLoading(false);
        }
      });
    } catch (e) {
      addToast(e.message, 'error');
      setMessages(prev => [...prev, { role: 'assistant', content: `*Error: ${e.message}*` }]);
      setStreamingMessage('');
      setStreamingReasoning(null);
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setUploadedContext({
      type: file.type.startsWith('image/') ? 'image' : 'text',
      data: ev.target.result, name: file.name
    });
    file.type.startsWith('image/') ? reader.readAsDataURL(file) : reader.readAsText(file);
  };

  // ========== Render ==========
  return React.createElement('div', { className: 'flex flex-col h-screen bg-zinc-950 text-zinc-200 overflow-hidden' },

    // Toast notifications (outside the error boundary)
    React.createElement('div', { className: 'fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none' },
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

    // Navbar
    React.createElement(window.Navbar, {
      workspace, setWorkspace,
      currentRepo, setCurrentRepo,
      currentBranch, setCurrentBranch,
      githubToken, setGithubToken,
      selectedModel, setSelectedModel,
      deployHook, setDeployHook,
      onFetchFileTree: fetchFileTree,
      isLoading, rememberKeys, setRememberKeys,
      activeTab, setActiveTab,
      models, modelsLoading,
      systemPromptOverride, setSystemPromptOverride,
      provider, setProvider,
      thinkingMode, setThinkingMode,
      reasoningEffort, setReasoningEffort,
    }),

    // Main content wrapped in ErrorBoundary
    React.createElement(window.ErrorBoundary, null,
      React.createElement('div', { className: 'flex-1 flex overflow-hidden' },

        // Conversation list sidebar
        React.createElement('div', { className: 'w-40 sm:w-48 bg-zinc-950 border-r border-zinc-900 flex flex-col shrink-0' },
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
                key: conv.id, onClick: () => setActiveConversationId(conv.id),
                className: `group flex items-center justify-between px-3 py-2.5 cursor-pointer transition border-b border-zinc-900/50 ${
                  conv.id === activeConversationId ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
                }`
              },
                React.createElement('span', { className: 'text-xs truncate flex-1' }, conv.title),
                React.createElement('button', {
                  onClick: e => { e.stopPropagation(); deleteConversation(conv.id); },
                  className: 'opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 ml-1 text-sm leading-none transition'
                }, '×')
              )
            )
          )
        ),

        // Tabs area
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
            onCmdHintClick: cmd => { setInputPrompt(cmd + ' '); if (inputRef.current) inputRef.current.focus(); },
            chatScrollRef, inputRef,
            streamingMessage, streamingReasoning,
            conversationId: activeConversationId,
          })
        )
      )
    )
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
