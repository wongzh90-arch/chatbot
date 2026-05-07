// js/agents/orchestrator.js

window.Orchestrator = (() => {

  const MAX_EXECUTE_ITERATIONS = 20;
  const MAX_REVIEW_CYCLES = 3;
  const TASK_RETRY_LIMIT = 2;

  const initialState = () => ({
    mode: 'manual',
    phase: 'idle',
    milestone: null,
    milestoneClosed: false,
    tasks: [],
    goal: null,
    lastExecutedTask: null,
    executeIterations: 0,
    reviewCycles: 0,
    taskRetries: {},
    runId: null,
  });

  let state = initialState();
  let pauseRequested = false;
  let pauseReason = null;

  function getState() { return { ...state }; }
  function setMode(m) { state.mode = m; }

  function resetState() {
    const prevMode = state.mode;
    state = initialState();
    state.mode = prevMode;
    state.runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pauseRequested = false;
    pauseReason = null;
    // Reset the queue as well
    window.TaskQueue.resetQueue();
  }

  function isTerminal() {
    return state.phase === 'done' || state.phase === 'error' || state.phase === 'idle';
  }

  function requestPause(reason = 'user') {
    pauseRequested = true;
    pauseReason = reason;
  }

  function checkPause() {
    if (!pauseRequested) return false;
    pauseRequested = false;
    return true;
  }

  function pauseMessage(context) {
    const remaining = state.tasks.filter(t => t.status === window.TaskQueue.STATUS.TODO).length;
    return `⏸ **Paused** ${context}. ${remaining} task(s) remaining.\nType \`/execute\` to continue or \`/manual\` to stay in step mode.`;
  }

  async function runPlanPhase({
    goal, repo, branch, githubToken,
    provider, model, thinkingMode, reasoningEffort,
    fileTree, addToast, setMessages,
    projectMemory, userMemory, systemPromptOverride,
    manifest,
  }) {
    resetState();
    state.phase = 'planning';
    state.goal = goal;

    setMessages(prev => [...prev,
      { role: 'user', content: `/plan ${goal}` },
      { role: 'assistant', content: `🔍 Analysing **${repo}** and creating a task plan for: "${goal}"...` }
    ]);

    try {
      const result = await window.PlannerAgent.analyzeAndPlan({
        goal, repo, branch, githubToken,
        provider, model, thinkingMode, reasoningEffort,
        fileTree, addToast,
        projectMemory, userMemory, systemPromptOverride,
        manifest,
      });

      if (result.error) {
        state.phase = 'error';
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `❌ Planning failed: ${result.message || result.error}`,
        }]);
        return { error: true, message: result.message || result.error };
      }

      // Planner now returns tasks directly from queue
      state.tasks = result.tasks;
      state.milestone = { title: result.milestoneTitle, description: result.analysis };

      const planSummary = `📋 **Milestone:** ${result.milestoneTitle}\n\n${result.analysis || ''}\n\n**Tasks:**\n${
        result.tasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n')
      }`;

      setMessages(prev => [...prev, { role: 'assistant', content: planSummary }]);

      if (checkPause()) {
        state.phase = 'awaiting_approval';
        setMessages(prev => [...prev, { role: 'assistant', content: pauseMessage('after planning') }]);
        return { paused: true };
      }

      if (state.mode === 'autopilot') {
        addToast('🤖 Autopilot: proceeding to execution...', 'info');
        return await runExecutePhase({
          repo, branch, githubToken,
          provider, model, thinkingMode, reasoningEffort,
          projectMemory, userMemory, systemPromptOverride,
          addToast, setMessages,
          setActiveFileContent: null, setActiveFilePath: null, setActiveTab: null,
          manifest,
        });
      }

      state.phase = 'awaiting_approval';
      return { needsApproval: true };

    } catch (err) {
      state.phase = 'error';
      addToast(`Plan phase crashed: ${err.message}`, 'error');
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ Unexpected error during planning: ${err.message}` }]);
      return { error: true, message: err.message };
    }
  }

  async function runExecutePhase({
    repo, branch, githubToken,
    provider, model, thinkingMode, reasoningEffort,
    projectMemory, userMemory, systemPromptOverride,
    addToast, setMessages,
    setActiveFileContent, setActiveFilePath, setActiveTab,
    manifest,
  }) {
    if (state.tasks.length === 0) {
      addToast('No active tasks. Run /plan first.', 'error');
      return { error: true, message: 'No tasks in state' };
    }

    if (state.phase === 'done') return { done: true };

    state.executeIterations += 1;
    if (state.executeIterations > MAX_EXECUTE_ITERATIONS) {
      state.phase = 'error';
      const msg = `Stopped: hit max execute iterations (${MAX_EXECUTE_ITERATIONS}).`;
      addToast(msg, 'error');
      setMessages(prev => [...prev, { role: 'assistant', content: `🛑 ${msg}` }]);
      return { error: true, message: msg };
    }

    state.phase = 'executing';

    try {
      // Refresh tasks from queue
      const allTasks = window.TaskQueue.getAllTasks();
      state.tasks = allTasks;

      const eligibleTasks = allTasks.filter(t => {
        const retries = t.retries || 0;
        return retries < TASK_RETRY_LIMIT && window.TaskQueue.isUnblocked(t);
      });

      const result = await window.ExecutorAgent.executeNextTask({
        tasks: eligibleTasks,
        repo, branch, githubToken,
        provider, model, thinkingMode, reasoningEffort,
        projectMemory, userMemory, manifest,
        systemPromptOverride,
        addToast,
        setActiveFileContent: setActiveFileContent || (() => {}),
        setActiveFilePath: setActiveFilePath || (() => {}),
        setActiveTab: setActiveTab || (() => {}),
      });

      if (!result) {
        const stillTodo = eligibleTasks.filter(t => t.status === window.TaskQueue.STATUS.TODO);
        if (stillTodo.length > 0) {
          state.phase = 'error';
          const msg = `${stillTodo.length} task(s) could not be executed (blocked or exceeded retry limit).`;
          addToast(msg, 'warning');
          setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${msg}` }]);
          return { error: true, partial: true, message: msg };
        }

        addToast('All eligible tasks done. Moving to review...', 'info');
        return await runReviewPhase({
          repo, branch, githubToken,
          provider, model, thinkingMode, reasoningEffort,
          fileTree: [], addToast, setMessages,
          projectMemory, userMemory, systemPromptOverride,
          manifest,
        });
      }

      if (result.failed) {
        state.taskRetries[result.taskId] = (state.taskRetries[result.taskId] || 0) + 1;
        const retries = state.taskRetries[result.taskId];
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⚠️ Task **${result.title}** (attempt ${retries}/${TASK_RETRY_LIMIT}) failed: ${result.reason || 'no code produced'}`,
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `🔨 Executed **${result.title}**`,
        }]);
        state.lastExecutedTask = result;
      }

      if (checkPause()) {
        state.phase = 'awaiting_approval';
        setMessages(prev => [...prev, { role: 'assistant', content: pauseMessage(`after "${result.title || 'task'}"`) }]);
        return { paused: true, lastTask: result };
      }

      if (state.mode === 'autopilot') {
        addToast('🤖 Autopilot: continuing...', 'info');
        await new Promise(r => setTimeout(r, 800));
        return await runExecutePhase({
          repo, branch, githubToken,
          provider, model, thinkingMode, reasoningEffort,
          projectMemory, userMemory, systemPromptOverride,
          addToast, setMessages,
          setActiveFileContent: null, setActiveFilePath: null, setActiveTab: null,
          manifest,
        });
      }

      return { needsApproval: true, lastTask: result };

    } catch (err) {
      state.phase = 'error';
      addToast(`Execution phase crashed: ${err.message}`, 'error');
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ Unexpected error during execution: ${err.message}` }]);
      return { error: true, message: err.message };
    }
  }

  async function runReviewPhase({
    repo, branch, githubToken,
    provider, model, thinkingMode, reasoningEffort,
    fileTree, addToast, setMessages,
    projectMemory, userMemory, systemPromptOverride,
    manifest,
  }) {
    if (state.tasks.length === 0) {
      addToast('No active tasks to review.', 'warning');
      return { error: true, message: 'No tasks in state' };
    }

    if (state.phase === 'done') return { done: true };

    if (checkPause()) {
      state.phase = 'awaiting_approval';
      setMessages(prev => [...prev, { role: 'assistant', content: pauseMessage('before review') }]);
      return { paused: true };
    }

    state.reviewCycles += 1;
    if (state.reviewCycles > MAX_REVIEW_CYCLES) {
      state.phase = 'error';
      const msg = `Stopped: hit max review cycles (${MAX_REVIEW_CYCLES}).`;
      addToast(msg, 'error');
      setMessages(prev => [...prev, { role: 'assistant', content: `🛑 ${msg}` }]);
      return { error: true, message: msg };
    }

    state.phase = 'reviewing';

    try {
      const allTasks = window.TaskQueue.getAllTasks();
      const doneCount = allTasks.filter(t => t.status === window.TaskQueue.STATUS.DONE).length;

      if (doneCount === 0) {
        state.phase = 'error';
        const msg = 'No completed tasks to review.';
        addToast(msg, 'warning');
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${msg}` }]);
        return { error: true, message: msg };
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `🔍 Reviewing ${doneCount} completed task(s) (cycle ${state.reviewCycles}/${MAX_REVIEW_CYCLES})...`,
      }]);

      const result = await window.ReviewerAgent.reviewCompletedTasks({
        tasks: allTasks,
        repo, branch, githubToken,
        provider, model, thinkingMode, reasoningEffort,
        fileTree, addToast,
        projectMemory, userMemory, manifest,
        systemPromptOverride,
      });

      if (result.issuesFound === 0) {
        state.phase = 'done';
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '✅ **All tasks reviewed and passed!** Ready to merge.',
        }]);

        // (Milestone closing is now conceptual – no GitHub issues to close)
        // We keep the flag to avoid double-done but no API call needed.
        if (window.ConversationMemory) {
          window.ConversationMemory.recordRunCompleted(repo, branch, true);
        }

        return { done: true };
      }

      if (state.reviewCycles >= MAX_REVIEW_CYCLES) {
        state.phase = 'error';
        const msg = `Review found ${result.issuesFound} issue(s) but cycle limit reached. Manual intervention needed.`;
        addToast(msg, 'warning');
        setMessages(prev => [...prev, { role: 'assistant', content: `🛑 ${msg}` }]);
        return { error: true, message: msg };
      }

      state.phase = 'executing';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ **${result.issuesFound} task(s) need fixes.** Re-executing...`,
      }]);

      if (state.mode === 'autopilot') {
        return await runExecutePhase({
          repo, branch, githubToken,
          provider, model, thinkingMode, reasoningEffort,
          projectMemory, userMemory, systemPromptOverride,
          addToast, setMessages,
          setActiveFileContent: null, setActiveFilePath: null, setActiveTab: null,
          manifest,
        });
      }

      return { needsApproval: true, issuesFound: result.issuesFound };

    } catch (err) {
      state.phase = 'error';
      addToast(`Review phase crashed: ${err.message}`, 'error');
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ Unexpected error during review: ${err.message}` }]);
      return { error: true, message: err.message };
    }
  }

  return {
    getState, setMode, resetState, isTerminal,
    requestPause, checkPause,
    runPlanPhase, runExecutePhase, runReviewPhase,
  };
})();
