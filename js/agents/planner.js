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
    manifest,
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
      .slice(0, 10);

    let sysPrompt;

    // ── Architecture summary from memory ─────────────────────
    let archBlock = '';
    if (window.ConversationMemory) {
      const arch = window.ConversationMemory.getArchitecture(repo);
      if (arch && arch.architecture) {
        archBlock = `\n\n## ARCHITECTURE CONSTRAINTS (MUST FOLLOW)\n${arch.architecture}\n\n`;
      }
    }

    if (manifest) {
      const moduleList = Object.entries(manifest)
        .map(([path, entry]) =>
          `- ${path} (${entry.lineCount} lines)\n  desc: ${entry.description || 'no description'}\n  exports: [${(entry.exports || []).join(', ')}]\n  imports: [${(entry.imports || []).join(', ')}]\n  importedBy: [${(entry.importedBy || []).join(', ')}]`
        )
        .slice(0, 10)
        .join('\n');

      sysPrompt = `You are a senior software architect. Be concise.

Repo: ${repo} (branch: ${branch})
${archBlock}
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
      sysPrompt = `You are a senior software architect. Be concise.

Repo: ${repo} (branch: ${branch})
${archBlock}
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

    let jsonStr = reply.content.replace(/```json\\s*/g, '').replace(/```\\s*/g, '').trim();
    const jsonMatch = jsonStr.match(/(\\{[\\s\\S]*\\})/);
    if (jsonMatch) jsonStr = jsonMatch[1];

    let plan;
    try {
      plan = JSON.parse(jsonStr);
    } catch {
      addToast('Failed to parse plan JSON.', 'error');
      return { error: 'PARSE_FAILED', raw: reply.content };
    }

    plan.tasks = plan.tasks.slice(0, 4);

    window.TaskQueue.createMilestone(
      plan.milestone_title || `Goal: ${goal.substring(0, 50)}`,
      plan.analysis || ''
    );

    const taskMap = [];

    for (let i = 0; i < plan.tasks.length; i++) {
      const t = plan.tasks[i];
      const depIds =
        t.depends_on_task_index != null
          ? taskMap[t.depends_on_task_index]
            ? [taskMap[t.depends_on_task_index]]
            : []
          : [];
      const newTask = window.TaskQueue.addTask(
        t.title,
        t.description,
        t.files || [],
        depIds
      );
      taskMap.push(newTask.id);
    }

    const createdTasks = window.TaskQueue.getAllTasks();

    addToast(`Plan created: ${createdTasks.length} tasks`, 'success');

    if (window.ConversationMemory) {
      window.ConversationMemory.recordPlanCreated(repo, branch, goal);
    }

    return {
      milestoneTitle: plan.milestone_title,
      analysis: plan.analysis,
      tasks: createdTasks,
    };
  }

  return { analyzeAndPlan };
})();
