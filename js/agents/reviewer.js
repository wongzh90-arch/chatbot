window.ReviewerAgent = (() => {
    async function reviewCompletedTasks({
        tasks,
        repo, branch, githubToken,
        openRouterKey, model,
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
            await window.TaskManager.updateTaskStatus(repo, task.number, 'REVIEW', githubToken);

            let sysPrompt = `You are a code reviewer. Review the following completed task for quality.

Task: ${task.title}
Task details: ${task.body || ''}

Repository: ${repo}
File tree: ${fileTree.map(f => f.path).join(', ')}

Check for:
1. Logic errors or bugs
2. Style inconsistencies with the rest of the codebase
3. Missing edge cases
4. Security issues (XSS, injection, etc.)
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

            const reply = await window.OpenRouterService.chatCompletion({
                messages: [{ role: 'user', content: 'Review this.' }],
                model,
                apiKey: openRouterKey,
                systemPrompt: sysPrompt,
                userContent
            });

            if (reply.trim().startsWith('PASS')) {
                await window.TaskManager.addComment(repo, task.number, `✅ **Review passed.**`, githubToken);
                await window.TaskManager.updateTaskStatus(repo, task.number, 'DONE', githubToken);
            } else {
                totalIssuesFound++;
                await window.TaskManager.addComment(repo, task.number, `⚠️ **Review found issues:**\n\n${reply}`, githubToken);
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
