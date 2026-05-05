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
        // Reset any tasks stuck in IN_PROGRESS back to TODO
        // (happens when a previous run crashed mid-execution)
        const stuckTasks = tasks.filter(t =>
            t.labels.some(l => l.name === 'task:in_progress')
        );
        for (const stuck of stuckTasks) {
            await window.TaskManager.updateTaskStatus(repo, stuck.number, 'TODO', githubToken);
            // Update label in local array too so the find below works correctly
            stuck.labels = stuck.labels.filter(l => !l.name.startsWith('task:'));
            stuck.labels.push({ name: 'task:todo' });
        }

        // Find an unblocked TODO task
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

        // Load only the first 2 target files to stay lean
        const fileContents = {};
        for (const path of targetFiles.slice(0, 2)) {
            try {
                const { content, sha } = await window.GitHubService.loadFileContent(
                    repo, branch, path, githubToken
                );
                // Truncate large files — send only first 150 lines
                const lines = content.split('\n');
                const truncated = lines.length > 150
                    ? lines.slice(0, 150).join('\n') + '\n\n// ... (truncated for brevity)'
                    : content;
                fileContents[path] = { content, sha, preview: truncated };
            } catch (e) {
                // File doesn't exist yet — executor will create it
                fileContents[path] = { content: '', sha: null, preview: '' };
            }
        }

        // Build lean system prompt
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

        if (actions.updateEditorContent) {
            let filePath = targetFiles[0];

            // Try to extract explicit file attribute
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

        // Mark as DONE here so the next loop iteration skips it
        await window.TaskManager.updateTaskStatus(repo, todoTask.number, 'DONE', githubToken);

        return { ...todoTask, issueNumber: todoTask.number };
    }

    return { executeNextTask };
})();
