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
        // Reset stuck IN_PROGRESS tasks
        const stuckTasks = tasks.filter(t =>
            t.labels.some(l => l.name === 'task:in_progress')
        );
        for (const stuck of stuckTasks) {
            await window.TaskManager.updateTaskStatus(repo, stuck.number, 'TODO', githubToken);
            stuck.labels = stuck.labels.filter(l => !l.name.startsWith('task:'));
            stuck.labels.push({ name: 'task:todo' });
        }

        // Find unblocked TODO task
        const todoTask = tasks.find(t => {
            const isTodo = t.labels.some(l => l.name === 'task:todo');
            const unblocked = window.TaskManager.isUnblocked(t, tasks);
            return isTodo && unblocked;
        });

        if (!todoTask) return null;

        await window.TaskManager.updateTaskStatus(repo, todoTask.number, 'IN_PROGRESS', githubToken);
        addToast(`🔨 Starting: ${todoTask.title}`);

        // Parse task body
        const body = todoTask.body || '';
        const fileMatch = body.match(/\*\*Files:\*\*\s*(.*)/);
        const targetFiles = fileMatch
            ? fileMatch[1].split(',').map(f => f.trim()).filter(Boolean)
            : [];
        const description = body.replace(/\*\*Files:\*\*.*/, '').trim();

        // Load file contents
        const fileContents = {};
        for (const path of targetFiles.slice(0, 2)) {
            try {
                const { content, sha } = await window.GitHubService.loadFileContent(
                    repo, branch, path, githubToken
                );
                const lines = content.split('\n');
                const truncated = lines.length > 150
                    ? lines.slice(0, 150).join('\n') + '\n\n// ... (truncated)'
                    : content;
                fileContents[path] = { content, sha, preview: truncated };
            } catch (e) {
                fileContents[path] = { content: '', sha: null, preview: '' };
            }
        }

        // Build system prompt
        let sysPrompt = `You are a coding assistant. Implement this task concisely.

Repo: ${repo} | Branch: ${branch}
Task: ${todoTask.title}
Instructions: ${description}
Files: ${targetFiles.join(', ')}

Current file contents:
${Object.entries(fileContents).map(([p, { preview }]) => `--- ${p} ---\n${preview}`).join('\n\n')}

Respond with ONLY the updated file content wrapped in:
<skill name="update_editor" file="path/to/file">FULL FILE CONTENT</skill>

- Output the complete file, not just the diff.
- If creating a new file, output its full content.
- No explanation, no commentary — just the skill block.`;

        if (systemPromptOverride && systemPromptOverride.trim()) {
            sysPrompt = systemPromptOverride + '\n\n' + sysPrompt;
        }

        if (userMemory && userMemory.length) {
            const relevantPrefs = window.ContextMatcher.selectRelevant(
                userMemory, todoTask.title + ' ' + description, 2
            );
            if (relevantPrefs.length) {
                sysPrompt += '\n\nUSER PREFS:\n' + relevantPrefs.join('\n');
            }
        }

        if (projectMemory && projectMemory.length) {
            sysPrompt += '\n\nPROJECT MEMORY:\n' + projectMemory.slice(0, 3).join('\n');
        }

        const userContent = `Implement: ${todoTask.title}`;

        const reply = await window.LLMProvider.chatCompletion({
            provider,
            model,
            messages: [{ role: 'user', content: 'Implement this.' }],
            systemPrompt: sysPrompt,
            userContent,
            thinkingMode: false,
            reasoningEffort,
        });

        const { modifiedReply, actions } = window.processAgentSkills(reply.content);
        addToast(`AI execution done for ${todoTask.title}`, 'info');

        let committed = false;

        if (actions.updateEditorContent) {
            let filePath = targetFiles[0];
            const fileAttrMatch = reply.content.match(/<skill name="update_editor" file="([^"]+)"[^>]*>/i);
            if (fileAttrMatch) filePath = fileAttrMatch[1];

            const oldSha = fileContents[filePath]?.sha || null;

            try {
                await window.GitHubService.commitFile(
                    repo, branch, filePath,
                    actions.updateEditorContent,
                    oldSha,
                    `Implement: ${todoTask.title}`,
                    githubToken
                );
                committed = true;

                if (setActiveFileContent && setActiveFilePath) {
                    setActiveFilePath(filePath);
                    setActiveFileContent(actions.updateEditorContent);
                    if (setActiveTab) setActiveTab('editor');
                }
            } catch (err) {
                addToast(`Commit failed for ${filePath}: ${err.message}`, 'error');
                // Leave task as IN_PROGRESS so it can be retried
                await window.TaskManager.updateTaskStatus(repo, todoTask.number, 'TODO', githubToken);
                return null;
            }
        }

        if (!committed) {
            addToast(`Warning: No code changes produced for ${todoTask.title}. Task remains TODO.`, 'warning');
            await window.TaskManager.updateTaskStatus(repo, todoTask.number, 'TODO', githubToken);
            return null;
        }

        await window.TaskManager.updateTaskStatus(repo, todoTask.number, 'DONE', githubToken);
        return { ...todoTask, issueNumber: todoTask.number };
    }

    return { executeNextTask };
})();
