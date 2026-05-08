// js/agents/executor.js
window.ExecutorAgent = (() => {
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
CRITICAL OUTPUT FORMAT – produce one skill block per file you modify:
<skill name="update_editor" file="path/to/file">
FULL FILE CONTENT HERE
</skill>
Rules:
- Output the COMPLETE file for each modified file, not a diff or snippet.
- The "file" attribute is REQUIRED on every block.
- You may produce multiple skill blocks if the task requires changes to more than one file.
- No prose before or after the skill blocks.
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
    // ── Phase 1D: extract ALL skill blocks, not just the first ──
    const { actions } = window.processAgentSkills(reply.content || '');
    const blocks = actions.updateEditorBlocks || [];
    if (blocks.length === 0) {
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
    // Check if first (or only) block is a FAILED signal
    const firstBlock = blocks[0];
    if (/^FAILED:/i.test(firstBlock.content)) {
      window.TaskQueue.updateTaskStatus(todoTask.id, window.TaskQueue.STATUS.FAILED, firstBlock.content.slice(0, 200));
      return {
        failed: true,
        taskId: todoTask.id,
        title: todoTask.title,
        reason: firstBlock.content.slice(0, 200),
      };
    }
    // Build fileMap for atomic commit — resolve file paths
    const fileMap = {};
    for (const block of blocks) {
      const filePath = block.file || targetFiles[0];
      if (!filePath) continue;
      fileMap[filePath] = {
        content: block.content,
        sha: fileContents[filePath]?.sha || null,
      };
    }
    if (Object.keys(fileMap).length === 0) {
      window.TaskQueue.updateTaskStatus(todoTask.id, window.TaskQueue.STATUS.FAILED, 'No file path determinable');
      return {
        failed: true,
        taskId: todoTask.id,
        title: todoTask.title,
        reason: 'No file path determinable',
      };
    }

    // ── Phase 2A: Lint & syntax check before commit (only for JS/JSX/TS files) ──
    const jsExtensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
    const filesToCheck = {};
    for (const [path, { content }] of Object.entries(fileMap)) {
      const ext = path.substring(path.lastIndexOf('.'));
      if (jsExtensions.includes(ext)) {
        filesToCheck[path] = content;
      }
    }
    if (Object.keys(filesToCheck).length === 0) {
      addToast(`ℹ️ No JS files changed – skipping lint/syntax check`, 'info');
    } else if (window.ExecutorAPI) {
      const [syntaxResult, lintResult] = await Promise.all([
        window.ExecutorAPI.syntax(filesToCheck),
        window.ExecutorAPI.lint(filesToCheck)
      ]);

      const allErrors = [
        ...(syntaxResult.errors || []),
        ...(lintResult.errors || [])
      ].filter(e => e.severity !== 'warning');

      const unreachable = syntaxResult._unreachable || lintResult._unreachable;

      if (allErrors.length > 0 && !unreachable) {
        addToast(`❌ Lint/syntax errors found – asking LLM to fix`, 'warning');
        const errorDetails = allErrors.map(e =>
          `${e.file}:${e.line || 1} - ${e.message}`
        ).join('\n');

        const fixPrompt = `Your previous implementation had these errors:\n${errorDetails}\n\nPlease provide corrected FULL file content for each affected file using <skill name="update_editor" file="..."> blocks.`;

        let retryReply;
        try {
          retryReply = await window.LLMProvider.chatCompletion({
            provider, model,
            messages: [{ role: 'user', content: fixPrompt }],
            systemPrompt: sysPrompt,
            userContent: fixPrompt,
            thinkingMode: false,
          });
        } catch (err) {
          window.TaskQueue.updateTaskStatus(todoTask.id, window.TaskQueue.STATUS.FAILED, `LLM retry failed: ${err.message}`);
          return {
            failed: true,
            taskId: todoTask.id,
            title: todoTask.title,
            reason: `LLM retry failed: ${err.message}`,
          };
        }

        const { actions: retryActions } = window.processAgentSkills(retryReply.content || '');
        if (retryActions.updateEditorBlocks.length > 0) {
          // Overwrite fileMap with fixed content
          for (const block of retryActions.updateEditorBlocks) {
            if (block.file && fileMap[block.file]) {
              fileMap[block.file].content = block.content;
            }
          }
          // Re-run validation one more time
          addToast(`✅ LLM attempted fix – re‑validating...`, 'info');
          const recheckSyntax = await window.ExecutorAPI.syntax(filesToCheck);
          const recheckLint = await window.ExecutorAPI.lint(filesToCheck);
          const stillErrors = [...(recheckSyntax.errors || []), ...(recheckLint.errors || [])]
            .filter(e => e.severity !== 'warning');
          if (stillErrors.length > 0) {
            window.TaskQueue.updateTaskStatus(todoTask.id, window.TaskQueue.STATUS.FAILED,
              `Lint errors remain: ${stillErrors.map(e => e.message).join(', ')}`);
            return {
              failed: true,
              taskId: todoTask.id,
              title: todoTask.title,
              reason: `Unfixed lint errors: ${stillErrors[0].message}`,
            };
          }
        } else {
          window.TaskQueue.updateTaskStatus(todoTask.id, window.TaskQueue.STATUS.FAILED,
            'LLM did not produce fixed code');
          return {
            failed: true,
            taskId: todoTask.id,
            title: todoTask.title,
            reason: 'No fixed skill blocks after lint errors',
          };
        }
      } else if (allErrors.length > 0 && unreachable) {
        addToast(`⚠️ Executor API unreachable – skipping lint/syntax check`, 'warning');
      }
    }

    // ── Atomic commit — all files in one Git Trees commit ───────
    let commitResult;
    try {
      commitResult = await window.GitHubService.commitMultipleFiles(
        repo, branch, fileMap,
        `Implement: ${todoTask.title}`,
        githubToken
      );
    } catch (err) {
      addToast(`Commit failed: ${err.message}`, 'error');
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
    const committedPaths = Object.keys(fileMap);
    const primaryPath = firstBlock.file || targetFiles[0];
    if (setActiveFileContent && setActiveFilePath) {
      setActiveFilePath(primaryPath);
      setActiveFileContent(fileMap[primaryPath]?.content || '');
      if (setActiveTab) setActiveTab('editor');
    }
    window.TaskQueue.updateTaskStatus(todoTask.id, window.TaskQueue.STATUS.DONE);
    addToast(`✅ Completed: ${todoTask.title} (${committedPaths.length} file${committedPaths.length > 1 ? 's' : ''} committed)`);
    if (window.ConversationMemory) {
      window.ConversationMemory.recordTaskCompleted(repo, branch, todoTask.title, true);
    }
    return {
      failed: false,
      taskId: todoTask.id,
      title: todoTask.title,
      filePath: primaryPath,
      filesCommitted: committedPaths,
      commitSha: commitResult?.commitSha,
    };
  }
  return { executeNextTask };
})();
