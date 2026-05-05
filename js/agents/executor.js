window.ExecutorAgent = (() => {
    async function executeNextTask({
        tasks,
        repo, branch, githubToken,
        openRouterKey, model,
        projectMemory,
        userMemory,
        systemPromptOverride,
        addToast,
        setActiveFileContent,
        setActiveFilePath,
        setActiveTab
    }) {
        const unblockedTodo = tasks.find(t =>
            t.labels.some(l => l.name === window.TaskManager.LABELS.TODO.name) &&
            window.TaskManager.isUnblocked(t, tasks)
        );

        if (!unblockedTodo) {
            const inProgress = tasks.filter(t => t.labels.some(l => l.name === window.TaskManager.LABELS.IN_PROGRESS.name));
            if (inProgress.length > 0) {
                addToast('All TODO tasks are blocked. Waiting for in-progress tasks to complete.', 'info');
            } else {
                addToast('No more TODO tasks. All work is done! 🎉', 'success');
            }
            return null;
        }

        addToast(`🔨 Executing: ${unblockedTodo.title}`, 'info');

        await window.TaskManager.updateTaskStatus(repo, unblockedTodo.number, 'IN_PROGRESS', githubToken);

        let sysPrompt = `You are an expert coding agent executing a single task.
Repo: ${repo} (branch: ${branch})
Task: ${unblockedTodo.title}
Task details: ${unblockedTodo.body || ''}

You have the following tools via XML tags:
- <skill name="update_editor">NEW_CODE</skill> — overwrites the editor with complete file content
- <skill name="read_file" path="PATH"/> — requests a file to be loaded

Instructions:
1. Load the files you need using <skill name="read_file" path="..."/> (one per file).
2. When you have the context, produce the final code using <skill name="update_editor">...</skill>.
3. The code must be COMPLETE — no placeholders or truncation.
4. After updating the editor, explain what you changed and why.`;

        // Override
        if (systemPromptOverride && systemPromptOverride.trim()) {
            sysPrompt = systemPromptOverride + '\n\n' + sysPrompt;
        }

        // User memory
        if (userMemory && userMemory.length) {
            const context = unblockedTodo.title + ' ' + (unblockedTodo.body || '');
            const relevantPrefs = window.ContextMatcher.selectRelevant(userMemory, context, 3);
            if (relevantPrefs.length) {
                sysPrompt += '\n\nRELEVANT USER PREFERENCES:\n' + relevantPrefs.map((p, i) => `${i+1}. ${p}`).join('\n');
            }
        }

        if (projectMemory && projectMemory.length) {
            sysPrompt += '\n\nPROJECT MEMORY:\n' + projectMemory.map((m, i) => `${i+1}. ${m}`).join('\n');
        }

        const userContent = `Execute this task: ${unblockedTodo.title}\n\n${unblockedTodo.body || ''}`;

        const reply = await window.OpenRouterService.chatCompletion({
            messages: [{ role: 'user', content: 'Execute the task.' }],
            model,
            apiKey: openRouterKey,
            systemPrompt: sysPrompt,
            userContent
        });

        const { modifiedReply, actions } = window.processAgentSkills(reply);

        if (actions.updateEditorContent) {
            setActiveFileContent(actions.updateEditorContent);
            setActiveTab('editor');
            addToast('Code applied to editor. Review and commit.', 'success');
        }

        await window.TaskManager.addComment(
            repo, unblockedTodo.number,
            `🤖 **Agent execution output:**\n\n${modifiedReply}`,
            githubToken
        );

        return {
            issueNumber: unblockedTodo.number,
            title: unblockedTodo.title,
            reply: modifiedReply,
            hadCodeUpdate: !!actions.updateEditorContent,
        };
    }

    return { executeNextTask };
})();
