import { GitHubService } from '../services/github.js';
import { LLMProvider } from '../services/llmProvider.js';
import { markTaskReviewPassed, markTaskTodo } from './taskQueue.js';

export async function reviewAll(ctx) {
    const done = ctx._getDoneTasks();
    if (!done.length) return { passed: true };
    ctx.onLog(`🔍 Reviewing ${done.length} task(s)`);
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
    const contents = {};
    for (const p of files) {
        try {
            const { content } = await GitHubService.loadFileContent(
                ctx.repo, ctx.branch, p, ctx.githubToken
            );
            contents[p] = content;
        } catch {
            contents[p] = '[unavailable]';
        }
    }

    const prompt = `You are a strict code reviewer. Review the implementation below.

Original goal: "${goal}"
Task title: "${task.title}"
Task description: "${task.description}"
Files actually written: ${files.join(', ')}

Implementation (read from repo after commit):
${Object.entries(contents).map(([p, c]) => `--- ${p} ---\n${c}`).join('\n\n')}

Review checklist:
- Does the file content match what the task description asked for?
- Are the correct properties/values changed in the correct files?
- Is there any mismatch between what was planned and what was actually written?

Rules:
- Your FIRST word must be exactly "PASS" or "ISSUES"
- If the task is correctly implemented: PASS
- If there are problems: ISSUES: <specific description of what is wrong and in which file>
- Do not write anything before PASS or ISSUES`;

    const reply = await LLMProvider.chatCompletion({
        provider: ctx.provider, model: ctx.model, messages: [],
        systemPrompt: 'You are a strict code reviewer. Your first word must be PASS or ISSUES. No exceptions.',
        userContent: prompt, thinkingMode: false
    });

    const verdict = reply.content.trim();
    const firstWord = verdict.split(/[\s:]/)[0].toUpperCase();
    ctx.onLog(`🔎 Review "${task.title}" [${files.join(', ')}]: ${verdict.slice(0, 150)}`);
    return firstWord === 'PASS';
}
