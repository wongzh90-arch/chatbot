/**
 * agenticPlanner – (full file with hierarchical sub‑goal support in final plan prompt)
 */
import { LLMProvider } from '../../services/llmProvider.js';
import { GitHubService } from '../../services/github.js';
import { WorkingMemory } from '../WorkingMemory.js';
import { initTaskQueue } from '../taskQueue.js';

export async function agenticPlan(ctx, goal) {
    const memory = new WorkingMemory();
    memory.goal = goal;

    const candidates = ctx.discoveryCache?.length
        ? ctx.discoveryCache
        : (ctx.fileTree || []).slice(0, 30);
    const candidatePaths = candidates.map(f => f.path);
    memory.notes.push(`Candidates: ${candidatePaths.join(', ')}`);

    for (let turn = 0; turn < 6; turn++) {
        const notReadYet = candidatePaths.filter(p => !memory.files[p]);
        if (notReadYet.length === 0) break;

        const prompt = `You are exploring a codebase to plan a change. The goal: "${memory.goal}"
Files not yet read: ${notReadYet.slice(0, 20).join(', ')}
${memory.toPromptContext()}

Decide your next action. Output exactly:
- READ: path/to/file
- DONE
Output only the action, no other text.`;

        const { content } = await LLMProvider.fastCompletion({
            provider: ctx.provider,
            messages: [],
            userContent: prompt,
            timeoutMs: 15000
        });

        const action = parseAgentAction(content);
        if (action.type === 'done') break;
        if (action.type === 'read' && action.path) {
            let fileContent = '';
            try {
                const { content: fc } = await GitHubService.loadFileContent(
                    ctx.repo, ctx.branch, action.path, ctx.githubToken
                );
                fileContent = fc;
            } catch { fileContent = '[file not found]'; }

            const summary = await summariseFile(ctx, goal, action.path, fileContent.slice(0, 3000));
            memory.addFile(action.path, fileContent, summary);
            memory.notes.push(`Read ${action.path}: ${summary}`);
        } else {
            memory.notes.push(`Agent said: ${content.slice(0, 200)}`);
        }
    }

    return finalPlanFromMemory(ctx, goal, memory);
}

async function finalPlanFromMemory(ctx, goal, memory) {
    const prompt = `Create a JSON plan for the goal: "${goal}"
Based on what we know:
${memory.toPromptContext()}

If the goal is simple and can be done in 1‑4 file edits, use "files" in each task.
If the goal is complex and would touch 5+ files OR requires independent steps,
use "subGoal" instead of "files" for tasks that should be handled recursively.

Return ONLY JSON:
{
  "milestone_title": "...",
  "analysis": "...",
  "tasks": [
    {
      "title": "...",
      "description": "...",
      "files": ["exact/path"],
      "subGoal": "full goal string"
    }
  ]
}`;

    const { content } = await LLMProvider.chatCompletion({
        provider: ctx.provider,
        model: ctx.model,
        messages: [],
        systemPrompt: 'You are a senior developer. Output only JSON.',
        userContent: prompt,
        thinkingMode: ctx.thinkingMode,
        reasoningEffort: ctx.reasoningEffort,
        timeoutMs: 20000
    });

    try {
        const json = JSON.parse(content.replace(/```json|```/g, '').trim());
        initTaskQueue(ctx, json.tasks);
        ctx.onLog(`📋 Plan: ${json.milestone_title}\n${json.tasks.length} tasks`);
        return json;
    } catch (e) {
        ctx.onLog(`Plan parse error: ${e.message}`);
        return null;
    }
}

function parseAgentAction(text) {
    const t = text.trim();
    if (t.toLowerCase().startsWith('done')) return { type: 'done' };
    const readMatch = t.match(/^READ:\s*(\S+)/i);
    if (readMatch) return { type: 'read', path: readMatch[1] };
    return { type: 'unknown' };
}

async function summariseFile(ctx, goal, path, content) {
    const trimmed = (content || '').slice(0, 3000);
    const { content: summary } = await LLMProvider.fastCompletion({
        provider: ctx.provider,
        messages: [],
        userContent: `In one sentence, describe what this file does and how it relates to the goal: "${goal}". File path: ${path}\n\n${trimmed}`,
        timeoutMs: 10000
    });
    return summary.trim();
}
