import { LLMProvider } from '../services/llmProvider.js';
import { initTaskQueue } from './taskQueue.js';

export async function plan(ctx, goal) {
    ctx.onLog('📝 Planning...');

    const discoveredContext = ctx.discoveryCache.length
        ? ctx.discoveryCache.map(f => `### ${f.path} (matched: ${f.hits.join(', ')})\n${f.content.slice(0, 3000)}`).join('\n\n')
        : (ctx.fileTree || []).slice(0, 8).map(f => f.path).join(', ');

    const usingDiscovery = ctx.discoveryCache.length > 0;

    const prompt = `Create a plan for: "${goal}"
Repo: ${ctx.repo}, branch: ${ctx.branch}

${usingDiscovery
    ? `The following files were scanned and found relevant to the goal (content shown):\n\n${discoveredContext}`
    : `Key files (names only — no content scan available):\n${discoveredContext}`
}

Based on the actual file contents above, determine exactly which files need to change and what must change in each.
Return ONLY JSON:
{
  "milestone_title": "short title",
  "analysis": "one sentence explaining which files need to change and why",
  "tasks": [
    {
      "title": "short task title",
      "description": "specific description of what to change, including property names, values, or code patterns",
      "files": ["exact/path/to/file"]
    }
  ]
}
Max 4 tasks. Each task must name the exact file path from the scanned list above.`;

    const reply = await LLMProvider.chatCompletion({
        provider: ctx.provider, model: ctx.model, messages: [],
        systemPrompt: 'You are a senior developer. Output only JSON. File paths must be exact — copy them from the context.',
        userContent: prompt,
        thinkingMode: ctx.thinkingMode,
        reasoningEffort: ctx.reasoningEffort
    });

    try {
        const json = JSON.parse(reply.content.replace(/```json|```/g, '').trim());
        initTaskQueue(ctx, json.tasks);
        ctx.onLog(`📋 Plan: ${json.milestone_title}\n💡 ${json.analysis}\n🗂 ${json.tasks.length} task(s): ${json.tasks.map(t => `${t.title} → [${(t.files || []).join(', ')}]`).join(' | ')}`);
        return json;
    } catch (e) {
        ctx.onLog(`Plan parse error: ${e.message}`);
        return null;
    }
}
