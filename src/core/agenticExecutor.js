/**
 * agenticExecutor – Executes a single task using a read‑before‑write loop.
 * The LLM may ask to read additional files before emitting the final code block.
 * The parser now recognises skill blocks directly — no “CODE:” prefix required.
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

    // Pre‑load target files to get SHAs and full content
    const shaMap = {};
    const fullContents = {};
    for (const path of targetFiles) {
        try {
            const { content, sha } = await GitHubService.loadFileContent(
                ctx.repo, ctx.branch, path, ctx.githubToken
            );
            memory.addFile(path, content, `Target file (already loaded): ${content.slice(0, 200)}`);
            shaMap[path] = sha;
            fullContents[path] = content;
        } catch {
            memory.notes.push(`Could not load ${path}`);
        }
    }

    for (let turn = 0; turn < 8; turn++) {
        const prompt = buildExecutionPrompt(memory, fullContents);
        const { content } = await LLMProvider.chatCompletion({
            provider: ctx.provider,
            model: ctx.model,
            messages: [],
            systemPrompt: 'You are a senior developer. Output exactly one action per turn.',
            userContent: prompt,
            thinkingMode: false,
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
            fullContents[action.path] = fileContent;
            ctx.onLog(`📖 Read ${action.path}: ${summary}`);
        } else if (action.type === 'code') {
            // Extract skill blocks from the reply
            const { actions } = processAgentSkills(content);
            const blocks = actions.updateEditorBlocks;
            if (blocks.length) {
                const fileMap = {};
                for (const b of blocks) {
                    const path = b.file || targetFiles[0];
                    const isHtml = /\.html?$/i.test(path);
                    const cleanContent = isHtml ? b.content : stripComments(b.content);
                    fileMap[path] = {
                        content: cleanContent,
                        sha: shaMap[path] || null
                    };
                }

                // Optional lint/syntax check (fail open on timeout)
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
            } else {
                ctx.onLog('⚠️ No update_editor block found in code reply');
            }
        } else if (action.type === 'done') {
            ctx.onLog('✅ Agent marked task as done');
            break;
        } else {
            // Unknown reply — log it and continue
            ctx.onLog(`📝 Agent note: ${content.slice(0, 200)}`);
            memory.notes.push(`Agent said: ${content.slice(0, 200)}`);
        }
    }
    ctx.onLog('❌ Executor ran out of turns');
    return null;
}

function buildExecutionPrompt(memory, fullContents) {
    let prompt = `You are implementing a code change.
Goal: ${memory.goal}

`;
    // Show full content of files we have
    const fileEntries = Object.entries(memory.files);
    const targetPaths = Object.keys(fullContents);
    for (const [path, data] of fileEntries) {
        if (targetPaths.includes(path) && fullContents[path]) {
            prompt += `--- FULL FILE: ${path} ---\n${fullContents[path]}\n\n`;
        } else {
            prompt += `--- CONTEXT: ${path} ---\n${data.summary}\n\n`;
        }
    }

    prompt += `Observations:\n${memory.notes.map(n => `- ${n}`).join('\n')}\n\n`;

    prompt += `Now, provide the complete new file contents inside <skill name="update_editor" file="path">...</skill> blocks.
CRITICAL: The file content you output MUST be identical to the FULL FILE shown above except for the specific change described below. Do NOT remove, reorder, reformat, or rewrite any existing code, comments, or whitespace. Keep every line exactly as it appears in the original.
You may also REQUEST more files if you need them: "READ: path/to/file".
If you are done, say "DONE".`;
    return prompt;
}

/**
 * Detect the type of agent reply.
 * Priority: if it contains a skill block → code.
 * Otherwise check for READ: or DONE.
 */
function parseAgentAction(text) {
    const t = text.trim();
    // Check for skill block first (most important)
    if (/<skill\s+name=["']update_editor["']/.test(t)) {
        return { type: 'code' };
    }
    if (t.toLowerCase().startsWith('done')) return { type: 'done' };
    const readMatch = t.match(/^READ:\s*(\S+)/i);
    if (readMatch) return { type: 'read', path: readMatch[1] };
    // fallback: unknown
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
