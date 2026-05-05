window.ExecutorAgent = (() => {
  async function executeNextTask({
    tasks,
    repo, branch, githubToken,
    provider, model, thinkingMode, reasoningEffort,
    projectMemory,
    userMemory,
    systemPromptOverride,
    addToast,
    setActiveFileContent,
    setActiveFilePath,
    setActiveTab,
  }) {
    // Find an unblocked TODO task
    const todoTask = tasks.find(t => {
      const isTodo = t.labels.some(l => l.name === 'task:todo');
      const unblocked = window.TaskManager.isUnblocked(t, tasks);
      return isTodo && unblocked;
    });

    if (!todoTask) return null;

    await window.TaskManager.updateTaskStatus(repo, todoTask.number, 'IN_PROGRESS', githubToken);
    addToast(`🔨 Starting: ${todoTask.title}`);

    // Parse task body for file list and description
    const body = todoTask.body || '';
    const fileMatch = body.match(/\*\*Files:\*\*\s*(.*)/);
    const targetFiles = fileMatch ? fileMatch[1].split(',').map(f => f.trim()) : [];
    const description = body.replace(/\*\*Files:\*\*.*/, '').trim();

    // Load the contents of the target files (gracefully handle new files)
    const fileContents = {};
    for (const path of targetFiles) {
      try {
        const { content, sha } = await window.GitHubService.loadFileContent(repo, branch, path, githubToken);
        fileContents[path] = { content, sha };
      } catch (e) {
        // File doesn't exist yet — executor will create it
        fileContents[path] = { content: '', sha: null };
      }
    }

    // Build system prompt
    let sysPrompt = `You are an expert coding assistant. Your job is to implement a specific task.

Repository: ${repo}
Current branch: ${branch}

Task title: ${todoTask.title}
Task description:
${description}

Files you should modify (if any): ${targetFiles.join(', ')}

Current contents of those files:
${Object.entries(fileContents).map(([p, { content }]) => `--- ${p} ---\n${content}\n`).join('\n\n')}

Instructions:
- Provide the new, complete file content(s) using the format: <skill name="update_editor">FULL FILE CONTENT</skill>
- If multiple files need changes, output a separate <skill name="update_editor">...</skill> block for each file, clearly stating which file it is for. Use: <skill name="update_editor" file="path/to/file.js">content</skill>
- Make only the changes required by the task.
- Do not modify files that are not listed.
- Output ONLY the skill blocks; no extra commentary.`;

    if (systemPromptOverride && systemPromptOverride.trim()) {
      sysPrompt = systemPromptOverride + '\n\n' + sysPrompt;
    }

    if (userMemory && userMemory.length) {
      const relevantPrefs = window.ContextMatcher.selectRelevant(userMemory, todoTask.title + ' ' + description, 3);
      if (relevantPrefs.length) {
        sysPrompt += '\n\nRELEVANT USER PREFERENCES:\n' + relevantPrefs.map((p, i) => `${i+1}. ${p}`).join('\n');
      }
    }

    if (projectMemory && projectMemory.length) {
      sysPrompt += '\n\nPROJECT MEMORY:\n' + projectMemory.map((m, i) => `${i+1}. ${m}`).join('\n');
    }

    const userContent = `Implement the following task: ${todoTask.title}`;

    // Get AI reply
    const reply = await window.LLMProvider.chatCompletion({
      provider,
      model,
      messages: [{ role: 'user', content: 'Implement this task.' }],
      systemPrompt: sysPrompt,
      userContent,
      thinkingMode,
      reasoningEffort,
    });

    // Process the skills in the reply
    const { modifiedReply, actions } = window.processAgentSkills(reply.content);
    addToast(`AI execution done for ${todoTask.title}`, 'info');

    // Apply each file update
    if (actions.updateEditorContent) {
      let filePath = targetFiles[0];

      // Try to extract explicit file attribute from the original reply
      const fileAttrMatch = reply.content.match(/<skill name="update_editor" file="([^"]+)"[^>]*>/i);
      if (fileAttrMatch) filePath = fileAttrMatch[1];

      const oldSha = fileContents[filePath]?.sha || null;

      await window.GitHubService.commitFile(
        repo, branch, filePath,
        actions.updateEditorContent,
        oldSha,
        `Implement: ${todoTask.title}`,
        githubToken
      );

      if (setActiveFileContent && setActiveFilePath) {
        setActiveFilePath(filePath);
        setActiveFileContent(actions.updateEditorContent);
        if (setActiveTab) setActiveTab('editor');
      }
    }

    // Return with issueNumber explicitly set so orchestrator can reference it
    return { ...todoTask, issueNumber: todoTask.number };
  }

  return { executeNextTask };
})();
