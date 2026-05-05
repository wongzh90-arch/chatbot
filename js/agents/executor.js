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

    if (!todoTask) return null; // no tasks left

    await window.TaskManager.updateTaskStatus(repo, todoTask.number, 'IN_PROGRESS', githubToken);
    addToast(`🔨 Starting: ${todoTask.title}`);

    // Parse task body for file list and description
    const body = todoTask.body || '';
    const fileMatch = body.match(/\*\*Files:\*\*\s*(.*)/);
    const targetFiles = fileMatch ? fileMatch[1].split(',').map(f => f.trim()) : [];
    const description = body.replace(/\*\*Files:\*\*.*/, '').trim();

    // Load the contents of the target files
    const fileContents = {};
    for (const path of targetFiles) {
      try {
        const { content, sha } = await window.GitHubService.loadFileContent(repo, branch, path, githubToken);
        fileContents[path] = { content, sha };
      } catch (e) {
        addToast(`Could not load ${path}`, 'warning');
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
      // If only one file is returned without explicit "file" attribute, assume it's the first target file
      let filePath = targetFiles[0];
      // Try to extract file attribute from the original reply
      const fileMatch = reply.content.match(/<skill name="update_editor" file="([^"]+)"[^>]*>/i);
      if (fileMatch) filePath = fileMatch[1];

      if (fileContents[filePath]) {
        const oldSha = fileContents[filePath].sha;
        await window.GitHubService.commitFile(repo, branch, filePath, actions.updateEditorContent, oldSha, `Implement: ${todoTask.title}`, githubToken);
      } else {
        // File doesn't exist, we might need to create it. Use the create-or-update approach.
        // For simplicity we'll just use a PUT with no SHA (will fail if file exists) – better to use GitHub's create content.
        // For now, we'll try creating with sha null.
        await window.GitHubService.commitFile(repo, branch, filePath, actions.updateEditorContent, null, `Create ${filePath}: ${todoTask.title}`, githubToken);
      }
      // Update active editor if provided
      if (setActiveFileContent && setActiveFilePath) {
        setActiveFilePath(filePath);
        setActiveFileContent(actions.updateEditorContent);
        if (setActiveTab) setActiveTab('editor');
      }
    }

    // For multiple files, the AI might have returned multiple skill blocks; our current processAgentSkills only handles one.
    // For simplicity, we'll assume one file change per task (as per planner's rules). If multiple, the executor would need to parse each block.

    return todoTask;
  }

  return { executeNextTask };
})();
