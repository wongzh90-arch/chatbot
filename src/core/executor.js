import { GitHubService } from '../services/github.js';
import { LLMProvider } from '../services/llmProvider.js';
import { ExecutorAPI } from '../services/executorApi.js';
import { ContextBuilder } from '../utils/contextBuilder.js';
import { processAgentSkills } from '../utils/agentSkills.js';
import { markTaskDone, markTaskFailed } from './taskQueue.js';

export async function executeAll(ctx) {
    const tasks = ctx._getPendingTasks();
    for (const t of tasks) {
        if (ctx.pauseRequested) break;
        ctx.onLog(`🔨 Executing: ${t.title}\n   📌 ${t.description}\n   🎯 Planned files: ${(t.files || []).join(', ') || 'none'}`);
        const result = await executeTask(ctx, t);
        if (result) {
            t.committedFiles = Object.keys(result);
            markTaskDone(ctx, t.id);
        } else {
            markTaskFailed(ctx, t.id);
        }
        ctx.onTaskUpdate();
    }
}

export async function executeTask(ctx, task) {
    const files = task.files || [];
    if (!files.length) return null;

    const discoveryPaths = ctx.discoveryCache
        .filter(f => !files.includes(f.path))
        .slice(0, 3)
        .map(f => f.path);

    const manifestPaths = ContextBuilder.identifyRequiredFiles({
        targetFiles: files, manifest: ctx.manifest, maxFiles: 5
    }).filter(p => !files.includes(p) && !discoveryPaths.includes(p));

    const allPaths = [...new Set([...files, ...discoveryPaths, ...manifestPaths])].slice(0, 8);

    const contents = {};
    for (const p of allPaths) {
        try {
            const { content, sha } = await GitHubService.loadFileContent(
                ctx.repo, ctx.branch, p, ctx.githubToken
            );
            contents[p] = { content, sha };
        } catch {
            contents[p] = { content: '', sha: null };
        }
    }

    const targetContents = files.map(f => ({ path: f, content: contents[f]?.content || '' }));
    const related = allPaths.filter(p => !files.includes(p)).map(p => ({ path: p, content: contents[p]?.content || '' }));

    const context = ContextBuilder.buildContext({ targetContents, relatedContents: related, manifest: ctx.manifest });

    const prompt = `Implement task: ${task.title}
Description: ${task.description}
Target files: ${files.join(', ')}
${context.contextString}
Current content:
${Object.entries(contents).map(([p, c]) => `--- ${p} ---\n${c.content}`).join('\n\n')}
Output COMPLETE new content for each file inside
<skill name="update_editor" file="path">...</skill> blocks.
IMPORTANT: Output raw file content only. Do NOT wrap in markdown code fences (\`\`\`).`;

    const reply = await LLMProvider.chatCompletion({
        provider: ctx.provider, model: ctx.model, messages: [],
        systemPrompt: 'You are a coding assistant. Output only skill blocks with raw file content — never markdown fences.',
        userContent: prompt,
        thinkingMode: false
    });

    const { actions } = processAgentSkills(reply.content);
    const blocks = actions.updateEditorBlocks;
    if (!blocks.length) return null;

    const fileMap = {};
    for (const b of blocks) {
        const path = b.file || files[0];
        const cleanContent = b.content.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
        fileMap[path] = { content: cleanContent, sha: contents[path]?.sha || null };
    }

    const lintable = {};
    for (const [p, { content }] of Object.entries(fileMap)) {
        if (p.endsWith('.js') || p.endsWith('.jsx')) lintable[p] = content;
    }

    if (Object.keys(lintable).length) {
        const [syntax, lint] = await Promise.all([
            ExecutorAPI.syntax(lintable),
            ExecutorAPI.lint(lintable)
        ]);
        if (syntax._unreachable) {
            ctx.onLog('⚠️ Executor unreachable — skipping lint gate');
        } else {
            const errors = [...(syntax.errors || []), ...(lint.errors || [])].filter(e => e.severity === 'error');
            if (errors.length) {
                ctx.onLog(`❌ Quality gate failed: ${errors[0].message} (${errors[0].file}:${errors[0].line})`);
                return null;
            }
            ctx.onLog('✅ Quality gate passed');
        }
    }

    try {
        await GitHubService.commitMultipleFiles(
            ctx.repo, ctx.branch, fileMap,
            `Task: ${task.title}`, ctx.githubToken
        );
        const writtenFiles = Object.keys(fileMap);
        ctx.onLog(`📝 Task touched ${writtenFiles.length} file(s): ${writtenFiles.join(', ')}`);
        return fileMap;
    } catch (e) {
        ctx.onLog(`Commit failed: ${e.message}`);
        return null;
    }
}

// Attach the single-task function to executeAll so SelfImprover can call it
executeAll._executeTask = executeTask;
