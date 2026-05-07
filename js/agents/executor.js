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
    manifest,
    systemPromptOverride,
    addToast,
    setActiveFileContent,
    setActiveFilePath,
    setActiveTab,
  }) {

    // Reset stuck in‑progress tasks (Phase 1C: use TaskQueue)
    const stuckTasks = tasks.filter(t => t.status === window.TaskQueue.STATUS.IN_PROGRESS);
    for (const stuck of stuckTasks) {
      window.TaskQueue.updateTaskStatus(stuck.id, window.TaskQueue.STATUS.TODO);
    }

    // Find next TODO task that is unblocked
    const todoTask = tasks.find(t =>
      t.status === window.TaskQueue.STATUS.TODO && window.TaskQueue.isUnblocked(t)
    );

    if (!todoTask) return null;

    window.TaskQueue.updateTaskStatus(todoTask.id, window.TaskQueue.STATUS.IN_PROGRESS);
    addToast(`🔨 Starting: ${todoTask.title}`);

    const targetFiles = todoTask.files || [];
    const description = todoTask.description || '';

    if (targetFiles.length === 0) {
      window.TaskQueue.updateTaskStatus(todoTask.id, window.TaskQueue.STATUS.FAILED, 'No target files specified');
      return {
        failed: true,
        taskId: todoTask.id,
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
      window.TaskQueue.updateTaskStatus(todoTask.id, window.TaskQueue.STATUS.FAILED, `LLM call failed: ${e.message}`);
      return {
        failed: true,
        taskId: todoTask.id,
        title: todoTask.title,
        reason: `LLM call failed: ${e.message}`,
      };
    }

    const extracted = extractUpdateEditor(reply.content || '');

    if (!extracted) {
      window.TaskQueue.updateTaskStatus(todoTask.id, window.TaskQueue.STATUS.FAILED, 'LLM did not produce a valid skill block');
      window.TaskQueue.addComment(
        `🤖 Execution attempt produced no valid \`update_editor\` skill block. Raw output (first 500 chars):\n\n\`\`\`\n${(reply.content || '').slice(0, 500)}\n\`\`\``
      );
      return {
        failed: true,
        taskId: todoTask.id,
        title: todoTask.title,
        reason: 'LLM did not produce a valid skill block',
      };
    }

    if (/^FAILED:/i.test(extracted.content)) {
      window.TaskQueue.updateTaskStatus(todoTask.id, window.TaskQueue.STATUS.FAILED, extracted.content.slice(0, 200));
      return {
        failed: true,
        taskId: todoTask.id,
        title: todoTask.title,
        reason: extracted.content.slice(0, 200),
      };
    }

    let filePath = extracted.file || targetFiles[0];
    if (!filePath) {
      window.TaskQueue.updateTaskStatus(todoTask.id, window.TaskQueue.STATUS.FAILED, 'No file path determinable');
      return {
        failed: true,
        taskId: todoTask.id,
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
        `Implement: ${todoTask.title}`,
        githubToken
      );
    } catch (err) {
      addToast(`Commit failed for ${filePath}: ${err.message}`, 'error');
      window.TaskQueue.updateTaskStatus(todoTask.id, window.TaskQueue.STATUS.FAILED, `Commit failed: ${err.message}`);
      if (window.ConversationMemory) {
        window.ConversationMemory.recordTaskCompleted(repo, branch, todoTask.title, false);
      }
      return {
        failed: true,
        taskId: todoTask.id,
        title: todoTask.title,
        reason: `Commit failed: ${err.message}`,
      };
    }

    if (setActiveFileContent && setActiveFilePath) {
      setActiveFilePath(filePath);
      setActiveFileContent(extracted.content);
      if (setActiveTab) setActiveTab('editor');
    }

    window.TaskQueue.updateTaskStatus(todoTask.id, window.TaskQueue.STATUS.DONE);
    addToast(`✅ Completed: ${todoTask.title}`);

    if (window.ConversationMemory) {
      window.ConversationMemory.recordTaskCompleted(repo, branch, todoTask.title, true);
    }

    return {
      failed: false,
      taskId: todoTask.id,
      title: todoTask.title,
      filePath,
    };
  }

  return { executeNextTask, extractUpdateEditor };
})();
