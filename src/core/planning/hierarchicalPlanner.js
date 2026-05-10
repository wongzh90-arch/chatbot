/**
 * hierarchicalPlanner – Extends the existing planners with the ability to
 * decompose a complex goal into sub‑goals.
 */
import { LLMProvider } from '../../services/llmProvider.js';
import { initTaskQueue } from '../taskQueue.js';

export async function hierarchicalPlan(ctx, goal, normalPlan) {
    const decision = await shouldDecompose(ctx, goal);
    if (!decision.decompose) {
        return normalPlan(ctx, goal);
    }

    ctx.onLog('🧩 Goal is complex – decomposing into sub‑goals...');
    const subGoals = await decomposeGoal(ctx, goal);

    const plan = {
        milestone_title: `Decomposed: ${goal.slice(0, 50)}`,
        analysis: decision.reason,
        tasks: subGoals.map((sg, i) => ({
            title: sg.title,
            description: sg.description,
            subGoal: sg.goal,
            order: i,
            dependsOn: sg.dependsOn || []
        }))
    };

    initTaskQueue(ctx, plan.tasks);
    ctx.onLog(`📋 Hierarchical plan: ${plan.tasks.length} sub‑goal(s)`);
    return plan;
}

async function shouldDecompose(ctx, goal) {
    const prompt = `You are an architect deciding whether a coding goal needs to be broken into sub‑goals.

Goal: "${goal}"
Repository: ${ctx.repo}, branch: ${ctx.branch}

Return ONLY JSON: { "decompose": true/false, "reason": "one sentence" }`;

    const { content } = await LLMProvider.fastCompletion({
        provider: ctx.provider,
        messages: [],
        userContent: prompt,
        timeoutMs: 10000
    });

    try {
        return JSON.parse(content.replace(/```json|```/g, '').trim());
    } catch {
        return { decompose: false, reason: 'parse error – treating as simple' };
    }
}

async function decomposeGoal(ctx, goal) {
    const prompt = `Break this coding goal into 2‑5 sub‑goals.

Goal: "${goal}"
Return ONLY JSON: { "subGoals": [ { "title": "...", "description": "...", "goal": "full goal string", "dependsOn": [] } ] }`;

    const { content } = await LLMProvider.chatCompletion({
        provider: ctx.provider,
        model: ctx.model,
        messages: [],
        systemPrompt: 'You are a senior architect. Output only JSON.',
        userContent: prompt,
        thinkingMode: ctx.thinkingMode,
        reasoningEffort: ctx.reasoningEffort,
        timeoutMs: 20000
    });

    try {
        const result = JSON.parse(content.replace(/```json|```/g, '').trim());
        return result.subGoals || [];
    } catch (e) {
        ctx.onLog(`⚠️ Sub‑goal parse error: ${e.message}`);
        return [];
    }
}
