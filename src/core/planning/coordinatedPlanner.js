/**
 * coordinatedPlanner – Multi‑agent plan creation.
 *
 * 1. Groups candidate files by their top‑level directory.
 * 2. Launches one exploration agent per directory (max 5 files each) – all
 *    agents run in parallel to stay well under the Netlify edge‑function timeout.
 * 3. A coordinator agent merges the per‑directory summaries into a single plan.
 *
 * The plan can contain either "files" (for simple tasks) or "subGoal" (for
 * complex, self‑contained sub‑problems) to feed hierarchical execution.
 */
import { LLMProvider } from '../../services/llmProvider.js';
import { GitHubService } from '../../services/github.js';
import { initTaskQueue } from '../taskQueue.js';

/**
 * Main entry point – called from SelfImprover.runGoal().
 * @param {object} ctx   - SelfImprover context (repo, branch, githubToken, etc.)
 * @param {string} goal  - enriched goal string
 * @returns {object|null} plan object or null on failure
 */
export async function coordinatedPlan(ctx, goal) {
    // 1. Gather candidate files from discovery cache or fallback to file tree
    const candidates = ctx.discoveryCache?.length
        ? ctx.discoveryCache
        : (ctx.fileTree || []).slice(0, 40);

    if (!candidates.length) {
        ctx.onLog('⚠️ No candidate files for coordinated planning');
        return null;
    }

    // 2. Group candidates by top‑level directory
    const dirMap = {};
    for (const f of candidates) {
        const dir = f.path.includes('/') ? f.path.split('/')[0] : '.';
        if (!dirMap[dir]) dirMap[dir] = [];
        dirMap[dir].push(f);
    }

    // 3. Run directory exploration agents in parallel
    const dirPromises = Object.entries(dirMap).map(([dir, files]) =>
        exploreDirectory(ctx, goal, dir, files.slice(0, 5)) // limit per dir
    );
    const dirSummaries = (await Promise.all(dirPromises)).filter(Boolean);

    if (!dirSummaries.length) {
        ctx.onLog('⚠️ All directory explorations returned empty');
        return null;
    }

    // 4. Coordinator merges summaries into a plan
    const plan = await coordinatorSynthesize(ctx, goal, dirSummaries);
    return plan;
}

/**
 * Explore a single directory by reading a sample file and asking the LLM
 * for a paragraph summary of that directory's purpose in relation to the goal.
 *
 * @param {object} ctx
 * @param {string} goal
 * @param {string} dir      - directory name (e.g., "src", "netlify")
 * @param {Array}  files    - file objects from discovery cache (each has .path)
 * @returns {string|null}   - summary string or null
 */
async function exploreDirectory(ctx, goal, dir, files) {
    if (!files.length) return null;

    // Pick the first file as a representative sample
    const samplePath = files[0].path;
    let sampleContent = '';
    try {
        const { content } = await GitHubService.loadFileContent(
            ctx.repo, ctx.branch, samplePath, ctx.githubToken
        );
        sampleContent = content.slice(0, 2000); // first 2000 chars are enough
    } catch {
        sampleContent = '[file unavailable]';
    }

    const filePaths = files.map(f => f.path).join(', ');

    const prompt = `You are examining the "${dir}" directory of a codebase.
Goal: "${goal}"

Sample file: ${samplePath}
First 2000 characters of content:
${sampleContent}

All files in this directory (sample): ${filePaths}

Write a short paragraph summarising the purpose of this directory and how it might relate to the goal. For example, mention key components, responsibilities, and any likely files that need changes.`;

    // Use a fast, cheap model – this is a simple summarisation task
    const { content } = await LLMProvider.fastCompletion({
        provider: ctx.provider,
        messages: [],
        userContent: prompt,
        timeoutMs: 15000
    });

    if (!content) return null;
    return `Directory ${dir}: ${content.trim()}`;
}

/**
 * Coordinator LLM call that combines all directory summaries into a concrete plan.
 *
 * @param {object} ctx
 * @param {string} goal
 * @param {string[]} dirSummaries - array of summary strings
 * @returns {object|null} plan JSON or null
 */
async function coordinatorSynthesize(ctx, goal, dirSummaries) {
    const combined = dirSummaries.join('\n');

    const prompt = `Goal: ${goal}

Below are summaries of relevant directories in the codebase, gathered by several exploration agents:

${combined}

Create a JSON plan that accomplishes the goal. The plan must contain a list of tasks.

For a simple task that only needs to edit a few known files, use the "files" field:
{
  "title": "...",
  "description": "...",
  "files": ["exact/path"]
}

For a complex, self‑contained task that would be better handled recursively (for example, a large feature that spans many files), use the "subGoal" field instead of "files":
{
  "title": "...",
  "description": "...",
  "subGoal": "a detailed, self‑contained goal string that can be passed to /self‑improve"
}

Important rules:
- Output ONLY valid JSON, no markdown fences, no commentary.
- Maximum 4 tasks.
- Ensure every file path you mention exists in the directory summaries above.
- Prefer "files" for straightforward changes; use "subGoal" only for truly complex, multi‑step features.

Return JSON in exactly this shape:
{
  "milestone_title": "short descriptive title",
  "analysis": "one‑sentence explanation of the approach",
  "tasks": [ ... ]
}`;

    // Use the selected model (or a reasoning one if thinkingMode is on)
    const { content } = await LLMProvider.chatCompletion({
        provider: ctx.provider,
        model: ctx.model,
        messages: [],
        systemPrompt: 'You are a senior software architect. Output only valid JSON.',
        userContent: prompt,
        thinkingMode: ctx.thinkingMode,
        reasoningEffort: ctx.reasoningEffort,
        timeoutMs: 20000
    });

    let plan;
    try {
        plan = JSON.parse(content.replace(/```json|```/g, '').trim());
    } catch (e) {
        ctx.onLog(`❌ Coordinator plan parse error: ${e.message}`);
        return null;
    }

    if (!plan.tasks?.length) {
        ctx.onLog('❌ Coordinator plan has no tasks');
        return null;
    }

    // Initialise the task queue with the plan's tasks (supports both files & subGoal)
    initTaskQueue(ctx, plan.tasks);
    ctx.onLog(
        `📋 Coordinated plan: ${plan.milestone_title}\n` +
        `💡 ${plan.analysis}\n` +
        `🗂 ${plan.tasks.length} task(s): ` +
        plan.tasks.map(t =>
            `${t.title} → ${t.files ? `[${t.files.join(', ')}]` : `sub‑goal: "${t.subGoal}"`}`
        ).join(' | ')
    );
    return plan;
}
