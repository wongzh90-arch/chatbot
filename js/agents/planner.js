window.PlannerAgent = (() => {
    async function analyzeAndPlan({
        goal,
        repo, branch, githubToken,
        provider, model, thinkingMode, reasoningEffort,
        fileTree,
        addToast,
        projectMemory,
        userMemory,
        systemPromptOverride
    }) {
        addToast('🔍 Analyzing repository...', 'info');

        const fileList = fileTree.map(f => f.path).join('\n');
        let sysPrompt = `You are a senior software architect analyzing a codebase.
Repo: ${repo} (branch: ${branch})
Goal: "${goal}"

Below is the complete file tree of the repository:
${fileList}

Your job is to:
1. Identify which files need to be changed or created.
2. Decide the correct dependency order.
3. Break the work into small, focused tasks (each task touches at most 1-2 files).

Return a JSON object with this exact structure:
{
  "analysis": "Brief analysis of what the repo does and how the goal fits in.",
  "milestone_title": "Short milestone name",
  "tasks": [
    {
      "title": "Short task title",
      "description": "Detailed instructions for the AI executor",
      "files": ["path/to/file.js"],
      "depends_on_task_index": null or (0-based index of the task that must complete first)
    }
  ]
}

Rules:
- Each task must be small and clearly defined.
- Dependencies must be acyclic.
- Return ONLY the JSON object, no markdown wrappers.`;

        if (systemPromptOverride && systemPromptOverride.trim()) {
            sysPrompt = systemPromptOverride + '\n\n' + sysPrompt;
        }

        if (userMemory && userMemory.length) {
            const context = goal + ' ' + repo + ' ' + branch;
            const relevantPrefs = window.ContextMatcher.selectRelevant(userMemory, context, 3);
            if (relevantPrefs.length) {
                sysPrompt += '\n\nRELEVANT USER PREFERENCES:\n' + relevantPrefs.map((p, i) => `${i+1}. ${p}`).join('\n');
            }
        }

        if (projectMemory && projectMemory.length) {
            sysPrompt += '\n\nPROJECT MEMORY:\n' + projectMemory.map((m, i) => `${i+1}. ${m}`).join('\n');
        }

        const userContent = `Analyze the repository ${repo} and create a plan to: ${goal}`;

        const reply = await window.LLMProvider.chatCompletion({
            provider,
            model,
            messages: [{ role: 'user', content: 'Plan this.' }],
            systemPrompt: sysPrompt,
            userContent,
            thinkingMode,
            reasoningEffort,
        });

        let jsonStr = reply.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const jsonMatch = jsonStr.match(/(\{[\s\S]*\})/);
        if (jsonMatch) jsonStr = jsonMatch[1];

        let plan;
        try {
            plan = JSON.parse(jsonStr);
        } catch {
            addToast('Failed to parse plan JSON. Raw reply shown in chat.', 'error');
            return { error: 'PARSE_FAILED', raw: reply.content };
        }

        addToast(`Plan created: ${plan.tasks.length} tasks`, 'success');

        try {
            await window.TaskManager.ensureLabels(repo, githubToken);
            const milestone = await window.TaskManager.createMilestone(
                repo,
                plan.milestone_title || `Goal: ${goal.substring(0, 50)}`,
                plan.analysis || '',
                githubToken
            );

            const issueMap = {};
            const createdTasks = [];

            for (let i = 0; i < plan.tasks.length; i++) {
                const task = plan.tasks[i];
                const blocking = task.depends_on_task_index != null
                    ? [issueMap[task.depends_on_task_index]].filter(Boolean)
                    : [];
                const body = `**Files:** ${(task.files || []).join(', ')}\n\n${task.description}`;
                const issue = await window.TaskManager.createTask(repo, task.title, body, milestone.number, githubToken, blocking);
                issueMap[i] = issue.number;
                createdTasks.push({ ...task, issueNumber: issue.number, html_url: issue.html_url });
            }

            addToast(`✅ ${createdTasks.length} tasks created in milestone "${milestone.title}"`, 'success');
            return {
                milestone,
                tasks: createdTasks,
                analysis: plan.analysis,
                issueMap
            };
        } catch (e) {
            addToast(`GitHub error: ${e.message}`, 'error');
            return { error: 'GITHUB_ERROR', message: e.message, plan };
        }
    }

    return { analyzeAndPlan };
})();
