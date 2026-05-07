// js/agents/executor.js
window.ExecutorAgent = (() => {

  function extractUpdateEditor(text) {
    if (typeof text !== 'string') return null;
    const re = /<skill\s+name=["']update_editor["'](?:\s+file=["']([^"']+)["'])?\s*>([\s\S]*?)<\/skill>/i;
    const m = text.match(re);
    if (!m) return null;
    return { file: m[1] || null, content: m[2].trim() };
  }

  async function executeNextTask({
    tasks,
    repo,
    branch,
    githubToken,
    provider,
    model,
    thinkingMode,
    reasoningEffort,
    projectMemory,
    userMemory,
    manifest,                    // Phase 1B
    systemPromptOverride,
    addToast,
    setActiveFileContent,
    setActiveFilePath,
    setActiveTab,
  }) {

    // Reset stuck in‑progress tasks
    const stuckTasks = tasks.filter(t =>
      t.labels.some(l => l.name === 'task:in_progress')
    );
    for (const stuck of stuckTasks) {
      try {
        await window.TaskManager.updateTaskStatus(repo, stuck.number, 'TODO', githubToken);
        stuck.labels = stuck.labels.filter(l => !l.name.startsWith('task:'));
        stuck.labels.push({ name: 'task:todo' });
      } catch (e) {
        console.warn(`Could not reset task #${stuck.number}:`, e.message);
      }
    }

    const todoTask = tasks.find(t => {
      const isTodo = t.labels.some(l => l.name === 'task:todo');
      const unblocked = window.TaskManager.isUnblocked(t, tasks);
      return isTodo && unblocked;
    });

    if (!todoTask) return null;

    try {
      await window.TaskManager.updateTaskStatus(repo, todoTask.number, 'IN_PROGRESS', githubToken);
    } catch (e) {
      addToast(`Could not mark task #${todoTask.number} as in-progress: ${e.message}`, 'error');
      return {
        failed: true,
        taskNumber: todoTask.number,
        title: todoTask.title,
        reason: `Could not update task status: ${e.message}`,
      };
    }

    addToast(`🔨 Starting: ${todoTask.title}`);

    const body = todoTask.body || '';
    const fileMatch = body.match(/\*\*Files:\*\*\s*(.*)/);
    const targetFiles = fileMatch
      ? fileMatch[1].split(',').map(f => f.trim()).filter(Boolean)
      : [];

    const description = body.replace(/\*\*Files:\*\*.*/, '').trim();

    if (targetFiles.length === 0) {
      await window.TaskManager.updateTaskStatus(repo, todoTask.number, 'TODO', githubToken);
      return {
        failed: true,
        taskNumber: todoTask.number,
        title: todoTask.title,
        reason: 'Task has no target files specified',
      };
    }

    // ---- Phase 1B: identify and load files via manifest ----
    let filesToLoad = [];
    if (manifest) {
      filesToLoad = window.ContextBuilder.identifyRequiredFiles({
        targetFiles,
        manifest,
        maxFiles: 10
      });
    } else {
      filesToLoad = targetFiles.slice(0, 2);
    }

    const fileContents = {};
    for (const path of filesToLoad) {
      try {
        const { content, sha } = await window.GitHubService.loadFileContent(repo, branch, path, githubToken);
        fileContents[path] = { content, sha, preview: content, exists: true };
      } catch (e) {
        fileContents[path] = { content: '', sha: null, preview: '(new file)', exists: false };
      }
    }

    // Build context
    const targetContents = targetFiles.map(p => ({ path: p, content: (fileContents[p]?.content || '') }));
    const relatedPaths = filesToLoad.filter(p => !targetFiles.includes(p));
    const relatedContents = relatedPaths.map(p => ({ path: p, content: fileContents[p]?.content || '' }));

    const contextResult = window.ContextBuilder.buildContext({
      targetContents,
      relatedContents,
      manifest,
      tokenBudget: 20000
    });

    let sysPrompt = `You are a coding assistant. Implement this task by producing the FULL updated file content.

Repo: ${repo} | Branch: ${branch}
Task: ${todoTask.title}
Instructions: ${description}

Target files: ${targetFiles.join(', ')}

${contextResult.contextString}

CRITICAL OUTPUT FORMAT – your reply must contain exactly one skill block:

<skill name="update_editor" file="path/to/file">
FULL FILE CONTENT HERE
</skill>

Rules:
- Output the COMPLETE file, not a diff or snippet.
- The "file" attribute is REQUIRED. Pick one of the target files above.
- No prose before or after the skill block.
- If you cannot complete the task, output: <skill name="update_editor" file="${targetFiles[0]}">FAILED: <reason></skill>`;

    if (systemPromptOverride && systemPromptOverride.trim()) {
      sysPrompt = systemPromptOverride + '\n\n' + sysPrompt;
    }

    if (userMemory && userMemory.length) {
      const relevantPrefs = window.ContextMatcher.selectRelevant(userMemory, todoTask.title + ' ' + description, 2);
      if (relevantPrefs.length) {
        sysPrompt += '\n\nUSER PREFS:\n' + relevantPrefs.join('\n');
      }
    }

    if (projectMemory && projectMemory.length) {
      sysPrompt += '\n\nPROJECT MEMORY:\n' + projectMemory.slice(0, 3).join('\n');
    }

    const userContent = `Implement: ${todoTask.title}`;

    let reply;
    try {
      reply = await window.LLMProvider.chatCompletion({
        provider,
        model,
        messages: [{ role: 'user', content: 'Implement this.' }],
        systemPrompt: sysPrompt,
        userContent,
        thinkingMode: false,
        reasoningEffort,
      });
    } catch (e) {
      await window.TaskManager.updateTaskStatus(repo, todoTask.number, 'TODO', githubToken);
      return {
        failed: true,
        taskNumber: todoTask.number,
        title: todoTask.title,
        reason: `LLM call failed: ${e.message}`,
      };
    }

    const extracted = extractUpdateEditor(reply.content || '');

    if (!extracted) {
      await window.TaskManager.updateTaskStatus(repo, todoTask.number, 'TODO', githubToken);
      await window.TaskManager.addComment(repo, todoTask.number,
        `🤖 Execution attempt produced no valid \`update_editor\` skill block. Raw output (first 500 chars):\n\n\`\`\`\n${(reply.content || '').slice(0, 500)}\n\`\`\``,
        githubToken
      ).catch(() => {});
      return {
        failed: true,
        taskNumber: todoTask.number,
        title: todoTask.title,
        reason: 'LLM did not produce a valid skill block',
      };
    }

    if (/^FAILED:/i.test(extracted.content)) {
      await window.TaskManager.updateTaskStatus(repo, todoTask.number, 'TODO', githubToken);
      return {
        failed: true,
        taskNumber: todoTask.number,
        title: todoTask.title,
        reason: extracted.content.slice(0, 200),
      };
    }

    let filePath = extracted.file || targetFiles[0];
    if (!filePath) {
      await window.TaskManager.updateTaskStatus(repo, todoTask.number, 'TODO', githubToken);
      return {
        failed: true,
        taskNumber: todoTask.number,
        title: todoTask.title,
        reason: 'No file path determinable',
      };
    }

    const oldSha = fileContents[filePath]?.sha || null;

    try {
      await window.GitHubService.commitFile(
        repo, branch, filePath,
        extracted.content,
        oldSha,
        `Implement: ${todoTask.title} (#${todoTask.number})`,
        githubToken
      );
    } catch (err) {
      addToast(`Commit failed for ${filePath}: ${err.message}`, 'error');
      await window.TaskManager.updateTaskStatus(repo, todoTask.number, 'TODO', githubToken);
      if (window.ConversationMemory) {
        window.ConversationMemory.recordTaskCompleted(repo, branch, todoTask.title, false);
      }
      return {
        failed: true,
        taskNumber: todoTask.number,
        title: todoTask.title,
        reason: `Commit failed: ${err.message}`,
      };
    }

    if (setActiveFileContent && setActiveFilePath) {
      setActiveFilePath(filePath);
      setActiveFileContent(extracted.content);
      if (setActiveTab) setActiveTab('editor');
    }

    try {
      await window.TaskManager.updateTaskStatus(repo, todoTask.number, 'DONE', githubToken);
    } catch (e) {
      addToast(`Could not mark task #${todoTask.number} as done: ${e.message}`, 'warning');
    }

    if (window.ConversationMemory) {
      window.ConversationMemory.recordTaskCompleted(repo, branch, todoTask.title, true);
    }

    return {
      failed: false,
      ...todoTask,
      issueNumber: todoTask.number,
      filePath,
    };
  }

  return { executeNextTask, extractUpdateEditor };
})();
