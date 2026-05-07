// js/handlers/useCommandHandler.js
window.useCommandHandler = function useCommandHandler({
  provider, selectedModel, thinkingMode, reasoningEffort,
  currentRepo, currentBranch, setCurrentBranch,
  githubToken, systemPromptOverride,
  messages, setMessages,
  uploadedContext, setUploadedContext,
  setStreamingMessage, setStreamingReasoning,
  setStatusMessage,
  isRunActive, setIsRunActive,
  fetchFileTree,
  loadFile,
  commitChange,
  handleCreateBranch, handleSwitchBranch, handleCreatePR,
  projectMemory, addMemoryRule, clearMemory,
  userMemory, setUserMemory,
  orchestratorTasks, setOrchestratorTasks,
  addToast,
  inputPrompt, setInputPrompt,
  loadManifest,
  manifest,
}) {
  const { useRef } = React;
  const selfImproveRunning = useRef(false);
  // ── Convenience: set status, auto-clear when passed '' ───────
  const setStatus = (msg) => {
    if (setStatusMessage) setStatusMessage(msg);
  };
  const pushFileCard = (fileData) => {
    setMessages(prev => [...prev, {
      role: 'file',
      path: fileData.path,
      content: fileData.content,
      sha: fileData.sha,
    }]);
  };
  const pushDiffCard = (path, oldContent, newContent, commitSha) => {
    const diffLines = window.DiffUtils
      ? window.DiffUtils.computeDiff(oldContent, newContent)
      : [];
    setMessages(prev => [...prev, {
      role: 'diff',
      path,
      diffLines,
      commitSha,
      committed: true,
    }]);
  };
  const getLastFileCard = (path) => {
    const fileMessages = messages.filter(
      m => m.role === 'file' && m.path === path
    );
    return fileMessages[fileMessages.length - 1] || null;
  };
  const refreshTasks = async () => {
    if (window.TaskQueue) {
      const state = window.TaskQueue.getState();
      setOrchestratorTasks(state.tasks);
      return;
    }
    const oState = window.Orchestrator.getState();
    if (oState.milestone) {
      const tasks = await window.TaskManager.getTasksByMilestone(
        currentRepo, oState.milestone.number, githubToken
      );
      setOrchestratorTasks(tasks);
    }
  };
  const getSynthesisModel = () => {
    if (provider === 'deepseek') return selectedModel;
    const freeModels = (window.ModelRegistry?.FALLBACK_MODELS || [])
      .filter(m => m.free && m.value !== 'openrouter/auto');
    const preferred = ['llama-3.3-70b', 'gemini-2.0-flash', 'qwen-2.5-72b', 'deepseek-r1'];
    for (const pref of preferred) {
      const match = freeModels.find(m => m.value.includes(pref));
      if (match) return match.value;
    }
    return freeModels[0]?.value || 'openrouter/auto';
  };
  const synthesiseSearchResults = async (query, results) => {
    const context = window.WebSearchService.formatForAI(results);
    try {
      const result = await window.LLMProvider.chatCompletion({
        provider,
        model: getSynthesisModel(),
        messages: [],
        systemPrompt: 'You are a helpful research assistant. Given web search results, write a concise, accurate synthesis. Use markdown. Keep it under 150 words.',
        userContent: `Query: "${query}"\n\nSearch results:\n${context}\n\nWrite a concise synthesis.`,
        thinkingMode: false,
      });
      return result.content;
    } catch {
      return null;
    }
  };
  const orchArgs = () => ({
    repo: currentRepo,
    branch: currentBranch,
    githubToken,
    provider,
    model: selectedModel,
    thinkingMode,
    reasoningEffort,
    projectMemory,
    userMemory,
    systemPromptOverride,
    addToast,
    setMessages,
    fileTree: [],
    manifest,
  });
  const getLastFileContext = () => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'file') return messages[i];
    }
    return null;
  };
  const executeSlashCommand = async (cmd, args, userText) => {
    switch (cmd) {
      case '/help':
        setMessages(prev => [...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: `**Available Commands:**\n${window.COMMANDS.map(c => `\`${c.cmd}\` — ${c.desc}`).join('\n')}\n\n💡 You can also describe intent naturally.` }
        ]);
        return true;
      case '/clear':
        setMessages([{ role: 'assistant', content: 'Chat cleared.' }]);
        return true;
      case '/fetch':
        fetchFileTree();
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        return true;
      case '/open': {
        if (!args) { addToast('Provide a file path', 'error'); return true; }
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        const fileData = await loadFile(args);
        if (fileData) pushFileCard(fileData);
        return true;
      }
      case '/commit': {
        const lastFile = getLastFileContext();
        if (!lastFile) {
          addToast('No file loaded in chat. Use /open <path> first.', 'error');
          return true;
        }
        const result = await commitChange(
          lastFile.path, lastFile.content, lastFile.sha, args || null
        );
        if (result) {
          setMessages(prev => [...prev,
            { role: 'user', content: userText },
            { role: 'assistant', content: `✅ Committed \`${lastFile.path}\`` }
          ]);
        }
        return true;
      }
      case '/learn':
        if (!args) { addToast('Provide rule', 'error'); return true; }
        addMemoryRule(args);
        setMessages(prev => [...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: `🧠 Learned: ${args}` }
        ]);
        return true;
      case '/forget':
        clearMemory();
        setMessages(prev => [...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: 'Project memory cleared.' }
        ]);
        return true;
      case '/branch': {
        if (!args) { addToast('Specify branch name', 'error'); return true; }
        const success = await handleCreateBranch(args);
        setMessages(prev => [...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: success ? `✅ Branch **${args}** created.` : `❌ Failed to create branch` }
        ]);
        return true;
      }
      case '/pr': {
        const parts = args.split(' ');
        const title = parts[0]?.replace(/"/g, '') || '';
        const base = parts[1] || null;
        if (!title) { addToast('Provide PR title', 'error'); return true; }
        const url = await handleCreatePR(title, base);
        setMessages(prev => [...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: url ? `🔀 PR opened: ${url}` : '❌ PR failed' }
        ]);
        return true;
      }
      case '/switch': {
        if (!args) { addToast('Specify branch', 'error'); return true; }
        await handleSwitchBranch(args);
        setMessages(prev => [...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: `🌿 Switched to **${args}**.` }
        ]);
        return true;
      }
      case '/search': {
        if (!args) { addToast('Enter a search query.', 'error'); return true; }
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        addToast('🔍 Searching...', 'info');
        setStatus(`🔍 Searching the web for "${args}"...`);
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
            addToast(`${results.length} results · synthesising...`, 'info');
            setStatus('💡 Synthesising search results...');
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
          setStatus('');
        } catch (e) {
          addToast(e.message, 'error');
          setMessages(prev => [...prev, { role: 'assistant', content: `❌ Search failed: ${e.message}` }]);
        }
        return true;
      }
      case '/plan': {
        if (!args) { addToast('Provide a goal.', 'error'); return true; }
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        setIsRunActive(true);
        setStatus('🔍 Analysing repository and building plan...');
        const planResult = await window.Orchestrator.runPlanPhase({ ...orchArgs(), goal: args });
        await refreshTasks();
        setStatus('');
        if (!planResult?.paused) setIsRunActive(false);
        return true;
      }
      case '/execute': {
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        setIsRunActive(true);
        setStatus('🔨 Executing tasks...');
        const execResult = await window.Orchestrator.runExecutePhase({
          ...orchArgs(),
          setActiveFileContent: () => {},
          setActiveFilePath: () => {},
          setActiveTab: () => {},
        });
        await refreshTasks();
        setStatus('');
        if (!execResult?.paused) setIsRunActive(false);
        return true;
      }
      case '/review': {
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        setIsRunActive(true);
        setStatus('🔍 Reviewing completed tasks...');
        const reviewResult = await window.Orchestrator.runReviewPhase(orchArgs());
        await refreshTasks();
        setStatus('');
        if (!reviewResult?.paused) setIsRunActive(false);
        return true;
      }
      case '/autopilot': {
        window.Orchestrator.setMode('autopilot');
        setMessages(prev => [...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: '🤖 **Autopilot enabled.** Running plan → execute → review loop.' }
        ]);
        return true;
      }
      case '/manual': {
        window.Orchestrator.setMode('manual');
        setMessages(prev => [...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: '🖐 **Manual mode.** Confirming at each step.' }
        ]);
        return true;
      }
      case '/pause': {
        if (window.Orchestrator && isRunActive) {
          window.Orchestrator.requestPause('user');
          addToast('⏸ Pause requested — stopping after current task', 'info');
        } else {
          addToast('No active run to pause', 'warning');
        }
        return true;
      }
      case '/tasks': {
        await refreshTasks();
        const oState = window.Orchestrator.getState();
        setMessages(prev => [...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: orchestratorTasks.length === 0
            ? 'No active tasks. Use `/plan <goal>` first.'
            : `📋 **Tasks** — check the sidebar for live status.`
          }
        ]);
        return true;
      }
      case '/remember': {
        if (!args) { addToast('Provide a preference to remember', 'error'); return true; }
        setUserMemory(prev => [...prev, args]);
        setMessages(prev => [...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: `🧠 I'll remember: **${args}**` }
        ]);
        return true;
      }
      case '/forgetme': {
        setUserMemory([]);
        setMessages(prev => [...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: 'All personal preferences cleared.' }
        ]);
        return true;
      }
      case '/myprefs': {
        setMessages(prev => [...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: userMemory.length === 0
            ? 'No personal preferences saved yet.'
            : `🧠 **Your preferences:**\n${userMemory.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
          }
        ]);
        return true;
      }
      case '/context': {
        if (window.ConversationMemory) {
          const ctx = window.ConversationMemory.get(currentRepo, currentBranch);
          setMessages(prev => [...prev,
            { role: 'user', content: userText },
            { role: 'assistant', content: ctx
              ? `**Conversation Context:**\n\`\`\`json\n${JSON.stringify(ctx, null, 2)}\n\`\`\``
              : 'No conversation context stored yet for this repo/branch.'
            }
          ]);
        }
        return true;
      }
      case '/rollback': {
        if (!currentRepo || !githubToken) { addToast('Missing repo or token', 'error'); return true; }
        try {
          let defaultBranch = 'main';
          try { defaultBranch = await window.GitHubService.getDefaultBranch(currentRepo, githubToken); } catch {}
          await window.GitHubService.resetBranch(currentRepo, currentBranch, defaultBranch, githubToken);
          addToast(`Branch reset to ${defaultBranch}`, 'success');
          await fetchFileTree();
          setMessages(prev => [...prev, { role: 'assistant', content: `↩️ Branch reset to \`${defaultBranch}\`. All uncommitted changes on this branch are lost.` }]);
        } catch (e) {
          addToast(e.message, 'error');
        }
        return true;
      }
      case '/self-improve': {
        if (!args) { addToast('Describe what to improve.', 'error'); return true; }
        if (selfImproveRunning.current) {
          addToast('Self-improvement already in progress.', 'warning');
          return true;
        }
        selfImproveRunning.current = true;
        setIsRunActive(true);
        const slug = args.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
        const newBranch = `self-improve/${Date.now()}-${slug}`;
        const origRepo = currentRepo;
        const origBranch = currentBranch;
        setMessages(prev => [...prev, { role: 'user', content: `/self-improve ${args}` }]);
        (async () => {
          try {
            let defaultBranch = 'main';
            try { defaultBranch = await window.GitHubService.getDefaultBranch(origRepo, githubToken); } catch {}
            setMessages(prev => [...prev, { role: 'assistant', content: `🌿 **Step 1/3:** Creating branch \`${newBranch}\` from \`${defaultBranch}\`...` }]);
            await window.GitHubService.createBranch(origRepo, defaultBranch, newBranch, githubToken);
            setCurrentBranch(newBranch);
            await fetchFileTree();
            window.Orchestrator.resetState();
            window.Orchestrator.setMode('autopilot');
            setMessages(prev => [...prev, { role: 'assistant', content: `🤖 **Step 2/3:** Running autopilot for: "${args}"...` }]);
            const result = await window.Orchestrator.runPlanPhase({
              ...orchArgs(),
              goal: args,
              branch: newBranch,
            });
            window.Orchestrator.setMode('manual');
            if (result?.error) {
              setMessages(prev => [...prev, { role: 'assistant', content: `❌ **Self-improve stopped:** ${result.message}` }]);
              return;
            }
            if (!result?.done) {
              setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ **Self-improve did not complete cleanly.** Branch \`${newBranch}\` left for inspection.` }]);
              return;
            }
            setMessages(prev => [...prev, { role: 'assistant', content: `🔀 **Step 3/3:** Opening pull request...` }]);
            const pr = await window.GitHubService.createPullRequest(origRepo, newBranch, `Self-improve: ${args.slice(0, 60)}`, defaultBranch, githubToken);
            setMessages(prev => [...prev, { role: 'assistant', content: `✅ **Self-improvement complete!**\n\n🔀 Pull Request: ${pr.html_url}` }]);
            addToast('🎉 PR opened!', 'success');
          } catch (err) {
            addToast(`Self-improve failed: ${err.message}`, 'error');
            setMessages(prev => [...prev, { role: 'assistant', content: `❌ **Self-improve failed:** ${err.message}` }]);
          } finally {
            setCurrentBranch(origBranch);
            await fetchFileTree();
            selfImproveRunning.current = false;
            setIsRunActive(false);
          }
        })();
        return true;
      }
      case '/manifest-build': {
        if (!currentRepo || !githubToken) {
          addToast('Missing repo or token', 'error');
          return true;
        }
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        addToast('🔧 Building manifest...', 'info');
        setStatus('🔧 Scanning files and building manifest...');
        try {
          const files = await window.GitHubService.fetchFileTree(currentRepo, currentBranch, githubToken);
          const jsFiles = files.filter(f => f.path.startsWith('js/') && (f.path.endsWith('.js') || f.path.endsWith('.jsx')));
          const fileContents = [];
          for (const f of jsFiles) {
            const data = await loadFile(f.path);
            if (data) fileContents.push({ path: data.path, content: data.content });
          }
          const manifest = await window.ManifestParser.buildManifest(fileContents, provider, selectedModel);
          const manifestJson = JSON.stringify(manifest, null, 2);
          let oldSha = null;
          try {
            const existing = await loadFile('manifest.json');
            if (existing) oldSha = existing.sha;
          } catch {}
          await commitChange('manifest.json', manifestJson, oldSha, 'chore: update manifest');
          if (loadManifest) await loadManifest();
          addToast('✅ Manifest built and committed', 'success');
          setStatus('');
          setMessages(prev => [...prev, { role: 'assistant', content: `✅ **Manifest built** — ${Object.keys(manifest).length} modules indexed.` }]);
        } catch (e) {
          setStatus('');
          addToast(`Manifest build failed: ${e.message}`, 'error');
          setMessages(prev => [...prev, { role: 'assistant', content: `❌ Manifest build failed: ${e.message}` }]);
        }
        return true;
      }
      // ========== NEW COMMAND: /analyze-arch ==========
      case '/analyze-arch': {
        if (!currentRepo || !githubToken) {
          addToast('Missing repo or token', 'error');
          return true;
        }
        setMessages(prev => [...prev, { role: 'user', content: userText }]);
        setStatus('🏛️ Analysing architecture...');
        addToast('Loading key modules to understand architecture (this may take a moment)...', 'info');
        try {
          // 1. Fetch the latest manifest.json directly (bypass stale closure)
          let currentManifest = null;
          try {
            const manifestFile = await loadFile('manifest.json');
            if (manifestFile && manifestFile.content) {
              currentManifest = JSON.parse(manifestFile.content);
            }
          } catch (e) {
            // manifest may not exist
          }
          if (!currentManifest) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'No manifest found. Please run `/manifest-build` first.' }]);
            setStatus('');
            return true;
          }

          // 2. Select important files: those with highest importedBy count + core UI files
          const entries = Object.entries(currentManifest);
          const sorted = entries.sort((a, b) => (b[1].importedBy?.length || 0) - (a[1].importedBy?.length || 0));
          const importantPaths = sorted.slice(0, 8).map(([path]) => path);
          const coreFiles = ['js/app.jsx', 'js/components/Navbar.jsx', 'js/components/LeftPane.jsx', 'js/components/ChatPane.jsx'];
          const toLoad = [...new Set([...coreFiles, ...importantPaths])].slice(0, 12);

          // 3. Load content (truncated to 4000 chars each)
          const fileContents = [];
          for (const path of toLoad) {
            try {
              const data = await loadFile(path);
              if (data) {
                fileContents.push({ path, content: data.content.slice(0, 4000) });
              }
            } catch (e) { /* ignore */ }
          }
          if (fileContents.length === 0) throw new Error('Could not load any source files');

          // 4. Build prompt for LLM
          const filesBlock = fileContents.map(f => `--- ${f.path} ---\n${f.content}\n`).join('\n');
          const archPrompt = `You are analysing a React web app that runs without a module bundler (no Webpack/Vite). All code is loaded via <script> tags and uses global window objects.

For each file below, answer in ONE sentence:
- Does it attach to window (e.g., window.Component = ...)?
- Does it use React.createElement directly or JSX (assume JSX is transformed by Babel in the browser)?
- Does it assume a module bundler (import/export statements)?
- How is it rendered or called by other files?

Then write a 2-3 sentence overall architecture description that explains how to add a new component correctly.

Files:
${filesBlock}`;

          const reply = await window.LLMProvider.chatCompletion({
            provider, model: selectedModel,
            messages: [],
            systemPrompt: 'You are a code architect. Be extremely concise. No markdown, just plain text.',
            userContent: archPrompt,
            thinkingMode: false,
          });

          // 5. Store result
          const archSummary = {
            architecture: reply.content.split('\n\n')[0] || reply.content.slice(0, 500),
            rawAnalysis: reply.content,
            updatedAt: new Date().toISOString(),
          };
          window.ConversationMemory.setArchitecture(currentRepo, archSummary);

          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `🏛️ **Architecture analysis complete.**\n\n${archSummary.architecture}\n\nThe planner will now respect these constraints when you run \`/plan\`.`
          }]);
          addToast('Architecture saved to memory', 'success');
        } catch (err) {
          addToast(`Analysis failed: ${err.message}`, 'error');
          setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${err.message}` }]);
        } finally {
          setStatus('');
        }
        return true;
      }
      default:
        return false;
    }
  };
  const sendMessage = async (overrideText) => {
    const userText = (overrideText || inputPrompt).trim();
    if (!userText) return;
    setInputPrompt('');
    // Slash command – only proceed if recognised
    if (userText.startsWith('/')) {
      const parts = userText.split(' ');
      const handled = await executeSlashCommand(parts[0].toLowerCase(), parts.slice(1).join(' '), userText);
      if (handled) return;
      // Unknown slash command – show error and stop
      setMessages(prev => [
        ...prev,
        { role: 'user', content: userText },
        { role: 'assistant', content: `❌ Unknown command \`${parts[0]}\`. Type \`/help\` for a list.` }
      ]);
      setInputPrompt('');
      return;
    }
    // Intent detection
    if (window.IntentDetector) {
      const intent = window.IntentDetector.detect(userText);
      if (intent && intent.confidence >= 0.85) {
        const full = intent.args ? `${intent.cmd} ${intent.args}` : intent.cmd;
        const parts = full.split(' ');
        if (await executeSlashCommand(parts[0], parts.slice(1).join(' '), userText)) return;
      }
    }
    // AI chat
    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setStatus('⏳ Waiting for response...');
    const lastFile = getLastFileContext();
    const fileBlock = lastFile
      ? `Active file: ${lastFile.path}\nContent:\n\`\`\`\n${lastFile.content.slice(0, 3000)}\n\`\`\``
      : 'No file currently open.';
    const memoryStr = projectMemory.length
      ? '\nPROJECT MEMORY:\n' + projectMemory.map((m, i) => `${i + 1}. ${m}`).join('\n')
      : '';
    let contextBlock = '';
    if (window.ConversationMemory) {
      const ctx = window.ConversationMemory.get(currentRepo, currentBranch);
      if (ctx) {
        contextBlock = `\nCONVERSATION CONTEXT:\nGoal: ${ctx.goal || 'none'}\nDecisions: ${(ctx.decisions || []).join('; ') || 'none'}\nLast action: ${ctx.lastAction || 'none'}\n`;
      }
    }
    let sysPrompt = `You are an autonomous coding agent. Repo: ${currentRepo} (branch: ${currentBranch}).\n${fileBlock}${memoryStr}${contextBlock}\nUse <skill name="update_editor" file="path/to/file">FULL FILE CONTENT</skill> to propose file changes.\nUse <skill name="read_file" path="..."/> to request a file be loaded.`;
    if (systemPromptOverride && systemPromptOverride.trim()) {
      sysPrompt = systemPromptOverride + '\n\n' + sysPrompt;
    }
    const contextForRelevance = userText + ' ' + messages.slice(-2).map(m => m.content || '').join(' ');
    const relevantPrefs = window.ContextMatcher.selectRelevant(userMemory, contextForRelevance, 3);
    if (relevantPrefs.length) {
      sysPrompt += '\n\nRELEVANT USER PREFERENCES:\n' + relevantPrefs.map((p, i) => `${i + 1}. ${p}`).join('\n');
    }
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
        onToken: (_, accumulated) => {
          if (accumulated.length < 10) setStatus('✍️ Receiving response...');
          setStreamingMessage(accumulated);
        },
        onDone: async (fullContent, usedModel, reasoning) => {
          setStatus('');
          try {
            const { modifiedReply, actions } = window.processAgentSkills(fullContent || '');
            if (actions.updateEditorContent && actions.updateEditorFile) {
              const existingFile = getLastFileContext();
              const sha = (existingFile && existingFile.path === actions.updateEditorFile)
                ? existingFile.sha
                : null;
              setMessages(prev => [...prev, {
                role: 'file',
                path: actions.updateEditorFile,
                content: actions.updateEditorContent,
                sha,
                proposed: true,
              }]);
              addToast('Agent proposed a file change — review and commit in chat', 'info');
            }
            const finalMessages = [...newMessages, {
              role: 'assistant',
              content: modifiedReply,
              model: usedModel,
              reasoning_content: reasoning,
            }];
            setMessages(finalMessages);
            if (window.ConversationMemory) {
              window.ConversationMemory.onAssistantMessage(
                modifiedReply, currentRepo, currentBranch
              );
            }
          } catch (err) {
            console.error('processAgentSkills error:', err);
            setMessages([...newMessages, {
              role: 'assistant', content: fullContent || '(no content)', model: usedModel
            }]);
          } finally {
            setStreamingMessage('');
            setStreamingReasoning(null);
            setUploadedContext(null);
          }
        },
        onError: (e) => {
          setStatus('');
          addToast(e.message, 'error');
          setMessages(prev => [...prev, { role: 'assistant', content: `*Error: ${e.message}*` }]);
          setStreamingMessage('');
          setStreamingReasoning(null);
        }
      });
    } catch (e) {
      setStatus('');
      addToast(e.message, 'error');
      setMessages(prev => [...prev, { role: 'assistant', content: `*Error: ${e.message}*` }]);
      setStreamingMessage('');
      setStreamingReasoning(null);
    }
  };
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setUploadedContext({
      type: file.type.startsWith('image/') ? 'image' : 'text',
      data: ev.target.result,
      name: file.name,
    });
    file.type.startsWith('image/') ? reader.readAsDataURL(file) : reader.readAsText(file);
  };
  return {
    sendMessage,
    handleFileUpload,
    executeSlashCommand,
    refreshTasks,
    pushFileCard,
    pushDiffCard,
  };
};
