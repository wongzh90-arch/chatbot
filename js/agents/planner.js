// js/agents/planner.js
window.PlannerAgent = (() => {

  async function analyzeAndPlan({
    goal,
    repo,
    branch,
    githubToken,
    provider,
    model,
    thinkingMode,
    reasoningEffort,
    fileTree,
    addToast,
    projectMemory,
    userMemory,
    systemPromptOverride,
    manifest,                    // Phase 1B — module manifest (can be null)
  }) {

    addToast('🔍 Analyzing repository...', 'info');

    const relevantExtensions = ['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.json'];
    const excludedDirs = ['node_modules', '.git', 'dist', 'build', '.next'];
    const filteredFiles = fileTree
      .filter(f => {
        const isExcluded = excludedDirs.some(d => f.path.startsWith(d));
        const isRelevant = relevantExtensions.some(ext => f.path.endsWith(ext));
        return !isExcluded && isRelevant;
      })
      .map(f => f.path)
      .slice(0, 40);

    let sysPrompt;

    if (manifest) {
      // Phase 1B — rich project structure from manifest
      const moduleList = Object.entries(manifest)
        .map(([path, entry]) =>
          `- ${path} (${entry.lineCount} lines)\n  desc: ${entry.description || 'no description'}\n  exports: [${(entry.exports || []).join(', ')}]\n  imports: [${(entry.imports || []).join(', ')}]\n  importedBy: [${(entry.importedBy || []).join(', ')}]`
        )
        .join('\n');

      sysPrompt = `You are a senior software architect. Be concise.

Repo: ${repo} (branch: ${branch})

Goal: "${goal}"

Project structure (from manifest):
${moduleList}

Return ONLY this JSON (no markdown, no extra text):

{
  "analysis": "One sentence summary of what needs to change.",
  "milestone_title": "Short milestone name (max 50 chars)",
  "tasks": [
    {
      "title": "Short task title",
      "description": "What to do in 2-3 sentences max.",
      "files": ["path/to/file.js"],
      "depends_on_task_index": null
    }
  ]
}

Rules:
- Max 4 tasks total.
- Each task touches at most 1 file.
- Descriptions must be brief and actionable.
- No acyclic dependencies.`;
    } else {
      // Fallback to original filename‑only prompt
      sysPrompt = `You are a senior software architect. Be concise.

Repo: ${repo} (branch: ${branch})

Goal: "${goal}"

Key files:
${filteredFiles.join('\n')}

Return ONLY this JSON (no markdown, no extra text):

{
  "analysis": "One sentence summary of what needs to change.",
  "milestone_title": "Short milestone name (max 50 chars)",
  "tasks": [
    {
      "title": "Short task title",
      "description": "What to do in 2-3 sentences max.",
      "files": ["path/to/file.js"],
      "depends_on_task_index": null
    }
  ]
}

Rules:
- Max 4 tasks total.
- Each task touches at most 1 file.
- Descriptions must be brief and actionable.
- No acyclic dependencies.`;
    }

    if (systemPromptOverride && systemPromptOverride.trim()) {
      sysPrompt = systemPromptOverride + '\n\n' + sysPrompt;
    }

    if (userMemory && userMemory.length) {
      const relevantPrefs = window.ContextMatcher.selectRelevant(userMemory, goal + ' ' + repo, 2);
      if (relevantPrefs.length) {
        sysPrompt += '\n\nUSER PREFS:\n' + relevantPrefs.join('\n');
      }
    }

    if (projectMemory && projectMemory.length) {
      sysPrompt += '\n\nPROJECT MEMORY:\n' + projectMemory.slice(0, 3).join('\n');
    }

    const userContent = `Plan: ${goal}`;

    const reply = await window.LLMProvider.chatCompletion({
      provider,
      model,
      messages: [{ role: 'user', content: 'Plan this.' }],
      systemPrompt: sysPrompt,
      userContent,
      thinkingMode: false,
      reasoningEffort,
    });

    let jsonStr = reply.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = jsonStr.match(/(\{[\s\S]*\})/);
    if (jsonMatch) jsonStr = jsonMatch[1];

    let plan;
    try {
      plan = JSON.parse(jsonStr);
    } catch {
      addToast('Failed to parse plan JSON.', 'error');
      return { error: 'PARSE_FAILED', raw: reply.content };
    }

    plan.tasks = plan.tasks.slice(0, 4);

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
        const issue = await window.TaskManager.createTask(
          repo, task.title, body, milestone.number, githubToken, blocking
        );

        issueMap[i] = issue.number;
        createdTasks.push({ ...task, issueNumber: issue.number, html_url: issue.html_url });
      }

      // 🔥 Phase 0C: record plan creation in conversation memory
      if (window.ConversationMemory) {
        window.ConversationMemory.recordPlanCreated(repo, branch, goal);
      }

      addToast(`✅ ${createdTasks.length} tasks created`, 'success');
      return { milestone, tasks: createdTasks, analysis: plan.analysis, issueMap };

    } catch (e) {
      addToast(`GitHub error: ${e.message}`, 'error');
      return { error: 'GITHUB_ERROR', message: e.message, plan };
    }
  }

  return { analyzeAndPlan };
})();
