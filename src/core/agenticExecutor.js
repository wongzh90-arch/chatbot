/**
 * agenticExecutor – Executes a single task using a read‑before‑write loop.
 * The LLM may ask to read additional files before emitting the final code block.
 * The parser now recognises skill blocks directly — no “CODE:” prefix required.
 *
 * Improvements:
 *  - Safe comment stripping (HTML/CSS preserved)
 *  - ContextBuilder integration (manifest‑aware file selection)
 *  - Pre‑commit quality gate with retry feedback
 *  - Strict prompt to prevent whole‑file rewriting
 */
import { LLMProvider } from '../services/llmProvider.js';
import { GitHubService } from '../services/github.js';
import { ExecutorAPI } from '../services/executorApi.js';
import { processAgentSkills } from '../utils/agentSkills.js';
import { stripComments } from '../utils/stripComments.js';
import { WorkingMemory } from './WorkingMemory.js';
import { ContextBuilder } from '../utils/contextBuilder.js';

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

    // Main execution loop (max 8 turns)
    for (let turn = 0; turn < 8; turn++) {
        const prompt = buildExecutionPrompt(memory, fullContents, ctx.manifest);
        const { content: rawReply } = await LLMProvider.chatCompletion({
            provider: ctx.provider,
            model: ctx.model,
            messages: [],
            systemPrompt: 'You are a senior developer. Output exactly one action per turn.',
            userContent: prompt,
            thinkingMode: false,
            timeoutMs: 20000
        });

        const action = parseAgentAction(rawReply);
        if (action.type === 'read' && action.path) {
            // --- Read additional file ---
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
            // --- Handle code proposal with lint retries ---
            const { actions } = processAgentSkills(rawReply);
            const blocks = actions.updateEditorBlocks;
            if (!blocks.length) {
                ctx.onLog('⚠️ No update_editor block found in code reply');
                continue;
            }

            // Build file map from blocks (allow multiple files)
            const fileMap = {};
            for (const b of blocks) {
                const path = b.file || targetFiles[0];
                // Only strip comments in JS/CSS – keep HTML/MD/TOML untouched
                const isJsCss = /\.(js|jsx|mjs|cjs|ts|tsx|css|scss|less)$/i.test(path);
                const cleanContent = isJsCss ? stripComments(b.content) : b.content;
                fileMap[path] = {
                    content: cleanContent,
                    sha: shaMap[path] || null
                };
            }

            // Pre‑commit quality gate: lint + syntax, retry up to 2 times
            const passed = await qualityGateWithRetry(ctx, memory, fileMap, targetFiles,
                                                      shaMap, fullContents);
            if (!passed) {
                ctx.onLog('❌ Quality gate failed after retries');
                return null;
            }

            // Commit the validated changes
            await GitHubService.commitMultipleFiles(
                ctx.repo, ctx.branch, fileMap,
                `Task: ${task.title}`, ctx.githubToken
            );
            ctx.onLog(`✅ Committed ${Object.keys(fileMap).length} file(s)`);
            return fileMap;

        } else if (action.type === 'done') {
            ctx.onLog('✅ Agent marked task as done');
            break;
        } else {
            ctx.onLog(`📝 Agent note: ${rawReply.slice(0, 200)}`);
            memory.notes.push(`Agent said: ${rawReply.slice(0, 200)}`);
        }
    }
    ctx.onLog('❌ Executor ran out of turns');
    return null;
}

// ─── Prompt building (now uses ContextBuilder for related files) ───

function buildExecutionPrompt(memory, fullContents, manifest) {
    const targetPaths = Object.keys(fullContents);
    const targetContents = targetPaths.map(p => ({
        path: p,
        content: fullContents[p]
    }));

    // Use ContextBuilder to get related file context (with token budget)
    let contextString = '';
    if (manifest && ContextBuilder.buildContext) {
        const relatedFiles = ContextBuilder.identifyRequiredFiles({
            targetFiles: targetPaths,
            manifest,
            maxFiles: 8
        }).filter(p => !targetPaths.includes(p));

        const relatedContents = [];
        for (const path of relatedFiles) {
            if (memory.files[path]) {
                relatedContents.push({ path, content: memory.files[path].summary || '' });
            }
        }
        const ctxResult = ContextBuilder.buildContext({
            targetContents,
            relatedContents,
            manifest,
            tokenBudget: 15000
        });
        contextString = ctxResult.contextString;
    } else {
        // Fallback: just full target files
        contextString = targetContents.map(f =>
            `--- FULL FILE: ${f.path} ---\n${f.content}\n`
        ).join('\n');
    }

    let prompt = `You are implementing a code change.
Goal: ${memory.goal}

${contextString}

Observations:
${memory.notes.map(n => `- ${n}`).join('\n')}

CRITICAL: Do NOT output the entire file. Output only the minimal change using one or more <skill name="update_editor" file="path"> blocks.
Each block must contain ONLY the exact lines that are changing, plus a single unchanged context line that exists in the original file and will NOT be modified. If the change is a pure insertion, include the line after which it should be inserted.

You may also REQUEST more files if you need them: "READ: path/to/file".
If you are done, say "DONE".`;
    return prompt;
}

// ─── Action parser (unchanged from original) ───

function parseAgentAction(text) {
    const t = text.trim();
    if (/<skill\s+name=["']update_editor["']/.test(t)) {
        return { type: 'code' };
    }
    if (t.toLowerCase().startsWith('done')) return { type: 'done' };
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

// ─── Quality gate with retry ───

async function qualityGateWithRetry(ctx, memory, fileMap, targetFiles,
                                    shaMap, fullContents) {
    for (let attempt = 0; attempt <= 2; attempt++) {
        // Run lint/syntax on JS/CSS files
        const lintable = {};
        for (const [path, { content }] of Object.entries(fileMap)) {
            if (/\.(js|jsx|css|scss|less)$/i.test(path)) {
                lintable[path] = content;
            }
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

            if (!errors.length) return true;

            if (attempt < 2) {
                ctx.onLog(`🔧 Lint errors found (attempt ${attempt+1}): ${errors[0].message}`);
                // Feed errors back to LLM for a fix
                const fixPrompt = `Your last change produced these errors:

${errors.map(e => `${e.file}: line ${e.line} - ${e.message}`).join('\n')}

Please fix them and output a corrected <skill name="update_editor" file="..."> block.
Keep the same minimal-change style.`;
                const { content } = await LLMProvider.fastCompletion({
                    provider: ctx.provider,
                    messages: [],
                    userContent: fixPrompt,
                    timeoutMs: 15000
                });
                const { actions } = processAgentSkills(content);
                const blocks = actions.updateEditorBlocks;
                if (blocks.length) {
                    // Reconstruct fileMap from corrected blocks
                    for (const b of blocks) {
                        const path = b.file || targetFiles[0];
                        const isJsCss = /\.(js|jsx|mjs|cjs|ts|tsx|css|scss|less)$/i.test(path);
                        fileMap[path] = {
                            content: isJsCss ? stripComments(b.content) : b.content,
                            sha: shaMap[path] || null
                        };
                    }
                } else {
                    break; // no new block, give up
                }
            }
        } else {
            return true; // nothing to lint
        }
    }
    return false;
}
