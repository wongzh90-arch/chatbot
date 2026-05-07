// js/services/conversationMemory.js
// Phase 0C — Persistent structured memory per repo/branch.
// Survives across conversations for the same repo+branch.
window.ConversationMemory = (() => {
  const STORAGE_PREFIX = 'repo_context_';
  const ARCH_PREFIX = 'arch_';
  const MAX_DECISIONS = 20;
  const MAX_FAILED_ATTEMPTS = 10;

  function getKey(repo, branch) {
    return `${STORAGE_PREFIX}${repo}_${branch}`;
  }

  function get(repo, branch) {
    if (!repo || !branch) return null;
    try {
      const raw = localStorage.getItem(getKey(repo, branch));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function set(repo, branch, updates) {
    if (!repo || !branch) return;
    const key = getKey(repo, branch);
    const current = get(repo, branch) || {
      goal: '',
      phase: 'idle',
      decisions: [],
      lastAction: '',
      openQuestions: [],
      failedAttempts: [],
      lastUpdated: null,
    };
    const merged = { ...current, ...updates, lastUpdated: new Date().toISOString() };
    if (merged.decisions.length > MAX_DECISIONS) merged.decisions = merged.decisions.slice(-MAX_DECISIONS);
    if (merged.failedAttempts.length > MAX_FAILED_ATTEMPTS) merged.failedAttempts = merged.failedAttempts.slice(-MAX_FAILED_ATTEMPTS);
    localStorage.setItem(key, JSON.stringify(merged));
  }

  function reset(repo, branch) {
    if (!repo || !branch) return;
    localStorage.removeItem(getKey(repo, branch));
  }

  function deleteForConversation(conversationId) {}

  function onAssistantMessage(content, repo, branch) {
    if (!content || !repo || !branch) return;
    const decisionPattern = /(?:decision|decided|I'll remember)/i;
    if (decisionPattern.test(content)) {
      const current = get(repo, branch);
      if (current) {
        const snippet = content.slice(0, 200).trim();
        current.decisions.push(snippet);
        current.lastAction = 'decision_recorded';
        set(repo, branch, current);
      }
    }
  }

  function buildMessageContext(messages, summary, budget = 40000) {
    let context = '';
    if (summary) {
      context += `Summary of earlier conversation:\n${summary}\n\n`;
    }
    let tokenCount = context.length / 4;
    const recent = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const label = msg.role === 'assistant' ? 'Assistant' : 'User';
      const text = label + ': ' + (msg.content || '');
      const tokens = text.length / 4;
      if (tokenCount + tokens > budget) break;
      recent.unshift(text);
      tokenCount += tokens;
    }
    return context + recent.join('\n');
  }

  // ── Architecture memory (per repo, not branch) ─────────────────
  function setArchitecture(repo, archData) {
    if (!repo) return;
    const key = `${ARCH_PREFIX}${repo}`;
    try {
      localStorage.setItem(key, JSON.stringify(archData));
    } catch (e) { console.warn('Failed to save architecture', e); }
  }

  function getArchitecture(repo) {
    if (!repo) return null;
    const key = `${ARCH_PREFIX}${repo}`;
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  // ── Trigger events (called by agents) ──────────────────────
  function recordPlanCreated(repo, branch, goal) {
    set(repo, branch, {
      goal,
      phase: 'planning',
      decisions: [],
      failedAttempts: [],
      openQuestions: [],
    });
  }

  function recordTaskCompleted(repo, branch, taskTitle, success) {
    const current = get(repo, branch) || {};
    if (success) {
      current.lastAction = `Task completed: ${taskTitle}`;
    } else {
      current.failedAttempts = current.failedAttempts || [];
      current.failedAttempts.push(`Task failed: ${taskTitle}`);
      current.lastAction = `Task failed: ${taskTitle}`;
    }
    set(repo, branch, current);
  }

  function recordRunCompleted(repo, branch, success) {
    const current = get(repo, branch) || {};
    current.phase = success ? 'done' : 'error';
    current.lastAction = success ? 'Run completed successfully' : 'Run failed';
    set(repo, branch, current);
  }

  return {
    get,
    set,
    reset,
    delete: deleteForConversation,
    onAssistantMessage,
    buildMessageContext,
    recordPlanCreated,
    recordTaskCompleted,
    recordRunCompleted,
    setArchitecture,
    getArchitecture,
  };
})();
