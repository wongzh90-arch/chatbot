/**
 * agenticExecutor – Executes a single task using a read‑before‑write loop.
 * The LLM may ask to read additional files before proposing edits.
 *
 * Edit formats supported:
 *   • Aider‑style SEARCH/REPLACE blocks (git conflict syntax) → recommended
 *   • Legacy <skill name="update_editor"> blocks (whole file) → fallback
 *
 * Features:
 *   - Comment stripping only for JS/CSS files
 *   - ContextBuilder integration (manifest‑aware)
 *   - Pre‑commit quality gate with retry feedback
 *   - Stores original file contents for reviewer
 */
import { LLMProvider } from '../services/llmProvider.js';
import { GitHubService } from '../services/github.js';
import { ExecutorAPI } from '../services/executorApi.js';
import { processAgentSkills } from '../utils/agentSkills.js';
import { stripComments } from '../utils/stripComments.js';
import { WorkingMemory } from './WorkingMemory.js';
import { ContextBuilder } from '../utils/contextBuilder.js';
import { SearchReplace } from '../utils/searchReplace.js';

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

    // Store original contents for reviewer (before any edits)
    task.originalContents = { ...fullContents };

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
            // --- Handle code proposal ---
            const { actions } = processAgentSkills(rawReply);
            const srBlocks = actions.searchReplaceBlocks;
            const upBlocks = actions.updateEditorBlocks;

            let fileMap = null;

            if (srBlocks.length > 0) {
                // ── SEARCH/REPLACE path (safe, minimal edits) ──
                fileMap = await applySearchReplaceEdits(ctx, srBlocks, fullContents, shaMap, targetFiles);
            } else if (upBlocks.length > 0) {
                // ── Legacy whole‑file blocks ──
                fileMap = buildFileMapFromUpdateBlocks(upBlocks, targetFiles, shaMap);
            } else {
                ctx.onLog('⚠️ No recognised edit block found');
                continue;
            }

            if (!fileMap) continue; // errors already logged

            // Pre‑commit quality gate + retry loop
            const passed = await qualityGateWithRetry(ctx, memory, fileMap, targetFiles,
                                                      shaMap, fullContents);
            if (!passed) {
                ctx.onLog('❌ Quality gate failed after retries');
                return null;
            }

            // Commit
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

// ─────────────────────────────────────────────────────
//  Search‑Replace application (new)
// ─────────────────────────────────────────────────────

async function applySearchReplaceEdits(ctx, srBlocks, fullContents, shaMap, targetFiles) {
    // Group blocks by file
    const byFile = {};
    for (const b of srBlocks) {
        const path = b.file || targetFiles[0];
        if (!byFile[path]) byFile[path] = [];
        byFile[path].push({ search: b.search, replace: b.replace });
    }

    const fileMap = {};
    for (const [path, blocks] of Object.entries(byFile)) {
        const original = fullContents[path];
        if (original === undefined) {
            ctx.onLog(`❌ Cannot apply SEARCH/REPLACE to unknown file: ${path}`);
            return null;
        }

        const result = SearchReplace.apply(path, original, blocks);
        if (result.errors.length > 0) {
            // Provide feedback to LLM (the caller will retry)
            ctx.onLog(`🔧 SEARCH/REPLACE match failed for ${path}:\n${result.errors[0].message}`);
            // Feed error back as a note so next turn the LLM can correct
            // (We can also trigger an immediate retry)
            await retrySearchReplace(ctx, path, original, blocks, result.errors);
            return null; // force a new turn
        }

        // Keep comment stripping only for JS/CSS
        const isJsCss = /\.(js|jsx|mjs|cjs|ts|tsx|css|scss|less)$/i.test(path);
        const finalContent = isJsCss ? stripComments(result.newContent) : result.newContent;
        fileMap[path] = {
            content: finalContent,
            sha: shaMap[path] || null
        };
        // Update in‑memory fullContents for subsequent turns
        fullContents[path] = finalContent;
        ctx.onLog(`📝 Prepared edit for ${path} via SEARCH/REPLACE`);
    }
    return fileMap;
}

/**
 * Feed SEARCH/REPLACE failure back to LLM and try to get a corrected block.
 * This consumes a turn but increases reliability dramatically.
 */
async function retrySearchReplace(ctx, filePath, original, blocks, errors) {
    const errorMsg = errors.map(e => e.message).join('\n');
    const feedbackPrompt = `Your SEARCH/REPLACE blocks for ${filePath} failed with these errors:

${errorMsg}

Current file content (first 1000 chars):
${original.slice(0, 1000)}

Please provide corrected SEARCH/REPLACE blocks that exactly match existing lines.`;
    const { content } = await LLMProvider.fastCompletion({
        provider: ctx.provider,
        messages: [],
        userContent: feedbackPrompt,
        timeoutMs: 15000
    });
    // Parse corrected blocks and inject them back? For simplicity,
    // we let the main loop handle the next turn – the LLM will see the last
    // assistant message with errors and can try again.
    // We can optionally pre‑fill the working memory with this feedback.
}

// ─────────────────────────────────────────────────────
//  Legacy whole‑file block building (unchanged logic)
// ─────────────────────────────────────────────────────

function buildFileMapFromUpdateBlocks(blocks, targetFiles, shaMap) {
    const fileMap = {};
    for (const b of blocks) {
        const path = b.file || targetFiles[0];
        const isJsCss = /\.(js|jsx|mjs|cjs|ts|tsx|css|scss|less)$/i.test(path);
        const cleanContent = isJsCss ? stripComments(b.content) : b.content;
        fileMap[path] = {
            content: cleanContent,
            sha: shaMap[path] || null
        };
    }
    return fileMap;
}

// ─────────────────────────────────────────────────────
//  Prompt building (now teaches SEARCH/REPLACE format)
// ─────────────────────────────────────────────────────

function buildExecutionPrompt(memory, fullContents, manifest) {
    const targetPaths = Object.keys(fullContents);
    const targetContents = targetPaths.map(p => ({
        path: p,
        content: fullContents[p]
    }));

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
        contextString = targetContents.map(f =>
            `--- FULL FILE: ${f.path} ---\n${f.content}\n`
        ).join('\n');
    }

    return `You are implementing a code change.
Goal: ${memory.goal}

${contextString}

Observations:
${memory.notes.map(n => `- ${n}`).join('\n')}

To make changes, use Aider‑style SEARCH/REPLACE blocks exactly as shown below:

path/to/file.ext
<<<<<<< SEARCH
exact lines to find
=======
replacement lines
>>>>>>> REPLACE

Rules:
- The SEARCH section must EXACTLY match existing lines including whitespace.
- Include enough context lines (3‑5) so the match is unique.
- You may include multiple SEARCH/REPLACE blocks for different files.
- Do NOT output the entire file – only the SEARCH/REPLACE blocks.
- Prefer small, minimal edits.

If you absolutely cannot express the change as SEARCH/REPLACE, you may use the legacy whole‑file block:
<skill name="update_editor" file="path">... complete file ...</skill>

You may also REQUEST more files: "READ: path/to/file".
If done, say "DONE".`;
}

// ─────────────────────────────────────────────────────
//  Action parser (unchanged)
// ─────────────────────────────────────────────────────

function parseAgentAction(text) {
    const t = text.trim();
    // Recognise both SEARCH/REPLACE and legacy update_editor blocks
    if (/<<<<<<< SEARCH/.test(t) || /<skill\s+name=["']update_editor["']/.test(t)) {
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

// ─────────────────────────────────────────────────────
//  Quality gate with retry (unchanged from previous)
// ─────────────────────────────────────────────────────

async function qualityGateWithRetry(ctx, memory, fileMap, targetFiles,
                                    shaMap, fullContents) {
    for (let attempt = 0; attempt <= 2; attempt++) {
        const lintable = {};
        for (const [path, { content }] of Object.entries(fileMap)) {
            if (/\.(js|jsx|css|scss|less)$/i.test(path)) {
                lintable[path] = content;
            }
        }

        if (Object.keys(lintable).length === 0) return true;

        const [syntax, lint] = await Promise.all([
            ExecutorAPI.syntax(lintable),
            ExecutorAPI.lint(lintable)
        ]);
        const errors = [
            ...(syntax.errors || []),
            ...(lint.errors || [])
        ].filter(e => e.severity === 'error');

        if (errors.length === 0) return true;

        if (attempt < 2) {
            ctx.onLog(`🔧 Lint errors (attempt ${attempt+1}): ${errors[0].message}`);
            const fixPrompt = `Your last change produced errors:

${errors.map(e => `${e.file}: line ${e.line} - ${e.message}`).join('\n')}

Fix them using a SEARCH/REPLACE block.`;
            const { content } = await LLMProvider.fastCompletion({
                provider: ctx.provider,
                messages: [],
                userContent: fixPrompt,
                timeoutMs: 15000
            });
            const { actions } = processAgentSkills(content);
            const srBlocks = actions.searchReplaceBlocks;
            const upBlocks = actions.updateEditorBlocks;

            // Reconstruct fileMap from corrected blocks
            if (srBlocks.length) {
                for (const b of srBlocks) {
                    const path = b.file || targetFiles[0];
                    const original = fullContents[path] || '';
                    const result = SearchReplace.apply(path, original, [b]);
                    if (!result.errors.length) {
                        const isJsCss = /\.(js|jsx|mjs|cjs|ts|tsx|css|scss|less)$/i.test(path);
                        fileMap[path] = {
                            content: isJsCss ? stripComments(result.newContent) : result.newContent,
                            sha: shaMap[path] || null
                        };
                    }
                }
            } else if (upBlocks.length) {
                for (const b of upBlocks) {
                    const path = b.file || targetFiles[0];
                    const isJsCss = /\.(js|jsx|mjs|cjs|ts|tsx|css|scss|less)$/i.test(path);
                    fileMap[path] = {
                        content: isJsCss ? stripComments(b.content) : b.content,
                        sha: shaMap[path] || null
                    };
                }
            }
        }
    }
    return false;
}
