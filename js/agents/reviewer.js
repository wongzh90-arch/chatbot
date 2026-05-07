// js/agents/reviewer.js
window.ReviewerAgent = (() => {

  async function reviewCompletedTasks({
    tasks,
    repo, branch, githubToken,
    provider, model, thinkingMode, reasoningEffort,
    fileTree,
    addToast,
    projectMemory,
    userMemory,
    manifest,
    systemPromptOverride
  }) {

    const doneTasks = tasks.filter(t => t.status === window.TaskQueue.STATUS.DONE);

    if (doneTasks.length === 0) {
      addToast('No completed tasks to review.', 'info');
      return { issuesFound: 0, reviewed: 0 };
    }

    addToast(`🔍 Reviewing ${doneTasks.length} completed task(s)...`, 'info');

    let totalIssuesFound = 0;
    let reviewedCount = 0;

    for (const task of doneTasks) {
      try {
        // Mark as REVIEW
        window.TaskQueue.updateTaskStatus(task.id, window.TaskQueue.STATUS.REVIEW);

        const targetFiles = task.files || [];
        const fileContents = {};

        for (const path of targetFiles.slice(0, 2)) {
          try {
            const { content } = await window.GitHubService.loadFileContent(repo, branch, path, githubToken);
            fileContents[path] = content;
          } catch (e) {
            fileContents[path] = `[File not accessible: ${e.message}]`;
          }
        }

        // Phase 1B: load consumers
        let consumerContents = {};
        if (manifest) {
          const consumerFiles = new Set();
          for (const tf of targetFiles) {
            const entry = manifest[tf];
            if (entry) {
              (entry.importedBy || []).forEach(p => consumerFiles.add(p));
            }
          }
          for (const cp of consumerFiles) {
            if (targetFiles.includes(cp)) continue;
            try {
              const { content } = await window.GitHubService.loadFileContent(repo, branch, cp, githubToken);
              consumerContents[cp] = content;
            } catch (e) { /* ignore */ }
          }
        }

        const targetFileContents = targetFiles.map(p => ({ path: p, content: fileContents[p] || '[unavailable]' }));
        const relatedFileContents = Object.entries(consumerContents).map(([p, c]) => ({ path: p, content: c }));

        const contextBlock = window.ContextBuilder.buildContext({
          targetContents: targetFileContents,
          relatedContents: relatedFileContents,
          manifest,
          tokenBudget: 20000
        }).contextString;

        let sysPrompt = `You are a strict but pragmatic code reviewer. Review this completed task.

Task: ${task.title}
Task details: ${task.description}
Repository: ${repo}

${contextBlock}

Check for:
1. Logic errors or obvious bugs
2. Missing critical edge cases (null checks, error handling)
3. Security issues (XSS, injection, exposed secrets)
4. Whether the change actually addresses the task

Be pragmatic. Do not flag style nitpicks. Do not flag missing tests unless tests are explicitly requested.

Respond with EXACTLY ONE of these:
- "PASS" (alone, on first line) if the implementation is acceptable
- "ISSUES:" followed by a bullet list of concrete problems that block merge`;

        if (systemPromptOverride && systemPromptOverride.trim()) {
          sysPrompt = systemPromptOverride + '\n\n' + sysPrompt;
        }

        if (userMemory && userMemory.length) {
          const ctx = task.title + ' ' + task.description;
          const relevantPrefs = window.ContextMatcher.selectRelevant(userMemory, ctx, 3);
          if (relevantPrefs.length) {
            sysPrompt += '\n\nRELEVANT USER PREFERENCES:\n' + relevantPrefs.map((p, i) => `${i+1}. ${p}`).join('\n');
          }
        }

        if (projectMemory && projectMemory.length) {
          sysPrompt += '\n\nPROJECT MEMORY:\n' + projectMemory.map((m, i) => `${i+1}. ${m}`).join('\n');
        }

        const userContent = `Review task ${task.title}`;
        const reply = await window.LLMProvider.chatCompletion({
          provider,
          model,
          messages: [{ role: 'user', content: 'Review.' }],
          systemPrompt: sysPrompt,
          userContent,
          thinkingMode,
          reasoningEffort,
        });

        reviewedCount += 1;

        const ok = /^\s*PASS\b/i.test((reply.content || '').trim());

        if (ok) {
          window.TaskQueue.addComment(`✅ **Review passed.**`);
          window.TaskQueue.updateTaskStatus(task.id, window.TaskQueue.STATUS.DONE);
        } else {
          totalIssuesFound++;
          window.TaskQueue.addComment(`⚠️ **Review found issues:**\n\n${reply.content}`);
          window.TaskQueue.updateTaskStatus(task.id, window.TaskQueue.STATUS.TODO); // back to TODO for re-execution
          addToast(`🐛 Issues found in "${task.title}"`, 'warning');
        }

      } catch (err) {
        console.error(`Review failed for task ${task.id}:`, err);
        addToast(`Error reviewing task: ${err.message}`, 'error');
        // restore to DONE to avoid hang
        window.TaskQueue.updateTaskStatus(task.id, window.TaskQueue.STATUS.DONE);
      }
    }

    if (totalIssuesFound === 0) {
      addToast('✅ All tasks passed review!', 'success');
    } else {
      addToast(`⚠️ ${totalIssuesFound} task(s) have issues.`, 'warning');
    }

    return { issuesFound: totalIssuesFound, reviewed: reviewedCount };
  }

  return { reviewCompletedTasks };
})();
