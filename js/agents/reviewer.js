window.ReviewerAgent = (() => {
    async function reviewCompletedTasks({
        tasks,
        repo, branch, githubToken,
        provider, model, thinkingMode, reasoningEffort,
        fileTree,
        addToast,
        projectMemory,
        userMemory,
        systemPromptOverride
    }) {
        const doneTasks = tasks.filter(t =>
            t.labels.some(l => l.name === window.TaskManager.LABELS.DONE.name)
        );

        if (doneTasks.length === 0) {
            addToast('No completed tasks to review.', 'info');
            return { issuesFound: 0 };
        }

        addToast(`🔍 Reviewing ${doneTasks.length} completed tasks...`, 'info');

        let totalIssuesFound = 0;

        for (const task of doneTasks) {
            try {
                await window.TaskManager.updateTaskStatus(repo, task.number, 'REVIEW', githubToken);

                // ── load files changed by this task ──
                const body = task.body || '';
                const fileMatch = body.match(/\*\*Files:\*\*\s*(.*)/);
                const targetFiles = fileMatch
                    ? fileMatch[1].split(',').map(f => f.trim()).filter(Boolean)
                    : [];

                const fileContents = {};
                for (const path of targetFiles.slice(0, 2)) {
                    try {
                        const { content } = await window.GitHubService.loadFileContent(
                            repo, branch, path, githubToken
                        );
                        const lines = content.split('\n');
                        const truncated = lines.length > 150
                            ? lines.slice(0, 150).join('\n') + '\n\n// ... (truncated)'
                            : content;
                        fileContents[path] = truncated;
                    } catch (e) {
                        fileContents[path] = `[File not accessible: ${e.message}]`;
                    }
                }

                // ── build system prompt with actual file content ──
                let sysPrompt = `You are a code reviewer. Review the following completed task for quality.

Task: ${task.title}
Task details: ${body}

Repository: ${repo}
Other files in repo: ${(fileTree || []).map(f => f.path).slice(0, 20).join(', ')}

Files changed (content after execution):
${Object.entries(fileContents)
    .map(([p, content]) => `--- ${p} ---\n${content}`)
    .join('\n\n')}

Check for:
1. Logic errors or bugs
2. Style inconsistencies
3. Missing edge cases
4. Security issues
5. Performance problems

If everything looks good, reply "PASS". If you find issues, reply with:
ISSUES:
- [Issue 1 description]
- [Issue 2 description]
...
Be concise.`;

                if (systemPromptOverride && systemPromptOverride.trim()) {
                    sysPrompt = systemPromptOverride + '\n\n' + sysPrompt;
                }

                if (userMemory && userMemory.length) {
                    const context = task.title + ' ' + (task.body || '');
                    const relevantPrefs = window.ContextMatcher.selectRelevant(userMemory, context, 3);
                    if (relevantPrefs.length) {
                        sysPrompt += '\n\nRELEVANT USER PREFERENCES:\n' + relevantPrefs.map((p, i) => `${i+1}. ${p}`).join('\n');
                    }
                }

                if (projectMemory && projectMemory.length) {
                    sysPrompt += '\n\nPROJECT MEMORY:\n' + projectMemory.map((m, i) => `${i+1}. ${m}`).join('\n');
                }

                const userContent = `Review the completed task: ${task.title}`;

                const reply = await window.LLMProvider.chatCompletion({
                    provider,
                    model,
                    messages: [{ role: 'user', content: 'Review this.' }],
                    systemPrompt: sysPrompt,
                    userContent,
                    thinkingMode,
                    reasoningEffort,
                });

                // Fixed: case-insensitive check for "PASS" as first word
                const ok = /^\s*PASS\b/i.test(reply.content);

                if (ok) {
                    await window.TaskManager.addComment(repo, task.number, `✅ **Review passed.**`, githubToken);
                    await window.TaskManager.updateTaskStatus(repo, task.number, 'DONE', githubToken);
                } else {
                    totalIssuesFound++;
                    await window.TaskManager.addComment(repo, task.number, `⚠️ **Review found issues:**\n\n${reply.content}`, githubToken);
                    await window.TaskManager.updateTaskStatus(repo, task.number, 'TODO', githubToken);
                    await fetch(`https://api.github.com/repos/${repo}/issues/${task.number}/labels`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${githubToken}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ labels: [window.TaskManager.LABELS.BUG.name] })
                    });
                    addToast(`🐛 Issues found in "${task.title}"`, 'warning');
                }
            } catch (err) {
                console.error(`Review failed for task #${task.number}:`, err);
                addToast(`Error reviewing task #${task.number}: ${err.message}`, 'error');
                // Leave the task as REVIEW so it can be retried manually
            }
        }

        if (totalIssuesFound === 0) {
            addToast('✅ All tasks passed review!', 'success');
        } else {
            addToast(`⚠️ ${totalIssuesFound} task(s) have issues. Check the task board.`, 'warning');
        }

        return { issuesFound: totalIssuesFound };
    }

    return { reviewCompletedTasks };
})();
