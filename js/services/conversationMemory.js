// js/services/conversationMemory.js
// Phase 0C — Persistent structured memory per repo/branch.
// Survives across conversations for the same repo+branch.
window.ConversationMemory = (() => {
  const STORAGE_PREFIX = 'repo_context_';
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
    // Trim arrays
    if (merged.decisions.length > MAX_DECISIONS) merged.decisions = merged.decisions.slice(-MAX_DECISIONS);
    if (merged.failedAttempts.length > MAX_FAILED_ATTEMPTS) merged.failedAttempts = merged.failedAttempts.slice(-MAX_FAILED_ATTEMPTS);
    localStorage.setItem(key, JSON.stringify(merged));
  }

  function reset(repo, branch) {
    if (!repo || !branch) return;
    localStorage.removeItem(getKey(repo, branch));
  }

  // No-op: memory is per repo/branch, not per conversationId
  function deleteForConversation(conversationId) {}

  function onAssistantMessage(content, repo, branch) {
    if (!content || !repo || !branch) return;
    // Fast regex detection of decisions
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
    // Rough token estimation: 1 token ≈ 4 chars
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
    // Optionally extract decisions to projectMemory?
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
  };
})();
