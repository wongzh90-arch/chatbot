/**
 * reviewer – Code review with before/after comparison.
 * Compares the original file (pre‑task) with the committed version,
 * enforces goal alignment, and demands line‑level issue reporting.
 */
import { GitHubService } from '../services/github.js';
import { LLMProvider } from '../services/llmProvider.js';
import { markTaskReviewPassed, markTaskTodo } from './taskQueue.js';

export async function reviewAll(ctx) {
    const done = ctx._getDoneTasks();
    if (!done.length) return { passed: true };
    ctx.onLog(`🔍 Reviewing ${done.length} task(s) with before/after comparison`);
    let issues = 0;
    for (const t of done) {
        const passed = await reviewTask(ctx, t);
        if (passed) markTaskReviewPassed(ctx, t.id);
        else { issues++; markTaskTodo(ctx, t.id); }
    }
    return { passed: issues === 0, issues };
}

export async function reviewTask(ctx, task) {
    const goal = ctx.currentGoal || 'the user request';
    const files = task.committedFiles || task.files || [];
    const originalContents = task.originalContents || {};

    // Load the committed file(s) from the repo
    const committedContents = {};
    for (const p of files) {
        try {
            const { content } = await GitHubService.loadFileContent(
                ctx.repo, ctx.branch, p, ctx.githubToken
            );
            committedContents[p] = content;
        } catch {
            committedContents[p] = '[unavailable]';
        }
    }

    // Build a prompt that compares original vs committed for each file
    let fileSection = '';
    for (const p of files) {
        const original = originalContents[p];
        const modified = committedContents[p] || '[unavailable]';

        if (original) {
            // We have both: show before and after side‑by‑side (conceptually)
            fileSection += `
### File: ${p}
**ORIGINAL (before task):**
\`\`\`
${original}
\`\`\`

**COMMITTED (after task):**
\`\`\`
${modified}
\`\`\`

`;
        } else {
            // No original stored – just show the committed version (fallback)
            fileSection += `
### File: ${p}
**CONTENT (original unknown, new file or first time):**
\`\`\`
${modified}
\`\`\`

`;
        }
    }

    const prompt = `You are a strict code reviewer. Compare the ORIGINAL and COMMITTED versions below.

Original goal: "${goal}"
Task title: "${task.title}"
Task description: "${task.description}"

${fileSection}

Checklist:
- Does the committed version contain exactly the changes that the task description demands?
- Are the correct files modified? (no unintended changes in other files)
- Are the modifications minimal and focused, or does the committed version contain unrelated reformatting, deletions, or additions?
- If the task said to add a comment, does the comment exist exactly where it should be? Use the exact wording.

Rules:
- Your first word must be "PASS" or "ISSUES".
- If ISSUES: describe each issue on a new line with the file name and the exact line number where the problem occurs. Use format: \`file:line\` e.g. \`index.html:10 missing comment\`.
- Do not write anything before PASS or ISSUES.`;

    const reply = await LLMProvider.chatCompletion({
        provider: ctx.provider,
        model: ctx.model,
        messages: [],
        systemPrompt: 'You are a strict code reviewer. Your first word must be PASS or ISSUES. Be precise with line numbers.',
        userContent: prompt,
        thinkingMode: false
    });

    const verdict = reply.content.trim();
    const firstWord = verdict.split(/[\s:]/)[0].toUpperCase();
    ctx.onLog(`🔎 Review "${task.title}" [${files.join(', ')}]: ${verdict.slice(0, 200)}`);
    return firstWord === 'PASS';
}
