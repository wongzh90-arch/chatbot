/**
 * agenticExecutor – Executes a single task using a read‑before‑write loop.
 * The LLM may ask to read additional files before emitting the final code block.
 * All calls are small and fast, avoiding timeout.
 */
import { LLMProvider } from '../services/llmProvider.js';
import { GitHubService } from '../services/github.js';
import { ExecutorAPI } from '../services/executorApi.js';
import { processAgentSkills } from '../utils/agentSkills.js';
import { stripComments } from '../utils/stripComments.js';
import { WorkingMemory } from './WorkingMemory.js';

export async function executeTaskAgentic(ctx, task) {
    const memory = new WorkingMemory();
    memory.goal = task.title + ': ' + task.description;
    const targetFiles = task.files || [];
    memory.notes.push(`Must modify: [${targetFiles.join(', ')}]`);

    // Pre‑load target files to get SHAs for commit
    const shaMap = {};
    for (const path of targetFiles) {
        try {
            const { content, sha } = await GitHubService.loadFileContent(
                ctx.repo, ctx.branch, path, ctx.githubToken
            );
            memory.addFile(path, content, `Target file (already present): ${content.slice(0, 200)}`);
            shaMap[path] = sha;
        } catch { /* will be null */ }
    }

    for (let turn = 0; turn < 8; turn++) {
        const prompt = buildExecutionPrompt(memory);
        const { content } = await LLMProvider.fastCompletion({
            provider: ctx.provider,
            messages: [],
            userContent: prompt,
            timeoutMs: 20000
        });

        const action = parseAgentAction(content);
        if (action.type === 'read' && action.path) {
            let fileContent = '';
            try {
                const { content: fc, sha } = await GitHubService.loadFileContent(
                    ctx.repo, ctx.branch, action.path, ctx.githubToken
                );
                fileContent = fc;
                if (!shaMap[action.path]) shaMap[action.path] = sha;
            } catch { fileContent = '[unavailable]'; }
            const summary = await summariseFile(ctx, memory.goal, action.path, fileContent.slice(0, 3000));
            memory.addFile(action.path, fileContent, summary);
            memory.notes.push(`Read ${action.path}: ${summary}`);
        } else if (action.type === 'code') {
            // The reply should contain <skill name="update_editor" ...> blocks
            const { actions } = processAgentSkills(content);
            const blocks = actions.updateEditorBlocks;
            if (blocks.length) {
                const fileMap = {};
                for (const b of blocks) {
                    const path = b.file || targetFiles[0];
                    const cleanContent = stripComments(b.content);
                    fileMap[path] = {
                        content: cleanContent,
                        sha: shaMap[path] || null
                    };
                }

                // Optional quick lint check (fail open on timeout)
                const lintable = {};
                for (const [path, { content: fileContent }] of Object.entries(fileMap)) {
                    if (path.endsWith('.js') || path.endsWith('.jsx'))
                        lintable[path] = fileContent;
                }
                if (Object.keys(lintable).length) {
                    const [syntax, lint] = await Promise.all([
                        ExecutorAPI.syntax(lintable),
                        ExecutorAPI.lint(lintable)
                    ]);
                    const errors = [
                        ...(syntax.errors || []),
                        ...(lint.errors || [])
                    ].filter(e => e.severity === 'error');
                    if (errors.length) {
                        ctx.onLog(`❌ Quality gate failed: ${errors[0].message}`);
                        return null;
                    }
                }

                await GitHubService.commitMultipleFiles(
                    ctx.repo, ctx.branch, fileMap,
                    `Task: ${task.title}`, ctx.githubToken
                );
                ctx.onLog(`✅ Committed ${Object.keys(fileMap).length} file(s)`);
                return fileMap;
            }
        } else if (action.type === 'done') {
            break;
        } else {
            memory.notes.push(`Agent: ${content.slice(0, 200)}`);
        }
    }
    return null;
}

function buildExecutionPrompt(memory) {
    return `You are implementing a code change. ${memory.goal}
${memory.toPromptContext()}

Choose one action:
- READ: path/to/file  (to inspect a file)
- CODE: (output skill blocks with updated editor content)
- DONE  (if change is complete)
Output only the action.`;
}

function parseAgentAction(text) {
    const t = text.trim();
    if (t.toLowerCase().startsWith('done')) return { type: 'done' };
    if (t.toLowerCase().startsWith('code')) return { type: 'code' };
    const readMatch = t.match(/^READ:\s*(\S+)/i);
    if (readMatch) return { type: 'read', path: readMatch[1] };
    return { type: 'unknown' };
}

async function summariseFile(ctx, goal, path, content) {
    const { content: summary } = await LLMProvider.fastCompletion({
        provider: ctx.provider,
        messages: [],
        userContent: `Summarise in one sentence: ${path}\n${content.slice(0, 3000)}`,
        timeoutMs: 10000
    });
    return summary.trim();
}
