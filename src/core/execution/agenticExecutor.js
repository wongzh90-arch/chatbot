/**
 * agenticExecutor – Executes a single task using a read‑before‑write loop.
 * Delegates prompt building, edit application, quality checks, and commit
 * verification to focused modules.
 */
import { LLMProvider } from '../../services/llmProvider.js';
import { GitHubService } from '../../services/github.js';
import { processAgentSkills } from '../../utils/agentSkills.js';
import { WorkingMemory } from '../WorkingMemory.js';
import { buildExecutionPrompt } from './promptBuilder.js';
import { applySearchReplaceEdits, buildFileMapFromUpdateBlocks } from './searchReplaceHandler.js';
import { qualityGateWithRetry } from './qualityGate.js';
import { verifyCommit } from './commitVerifier.js';

export async function executeTaskAgentic(ctx, task) {
    const memory = new WorkingMemory();
    memory.goal = task.title + ': ' + task.description;
    const targetFiles = task.files || [];
    memory.notes.push(`Must modify: [${targetFiles.join(', ')}]`);

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
    task.originalContents = { ...fullContents };

    const memSummary = ctx.conversationMemory?.toSummaryString() || '';

    for (let turn = 0; turn < 8; turn++) {
        if (ctx.pauseRequested) break;

        const prompt = buildExecutionPrompt(memory, fullContents, ctx.manifest, memSummary);

        if (ctx.onTokenUpdate) {
            const tokensUsed = Math.ceil(prompt.length / 4);
            ctx.onTokenUpdate(tokensUsed, 20000);
        }

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
            const { actions } = processAgentSkills(rawReply);
            // Check for pending corrected blocks from a previous retry
            const srBlocks = ctx._pendingSRBlocks || actions.searchReplaceBlocks;
            ctx._pendingSRBlocks = null;
            const upBlocks = actions.updateEditorBlocks;

            let fileMap = null;
            if (srBlocks.length > 0) {
                fileMap = await applySearchReplaceEdits(ctx, srBlocks, fullContents, shaMap, targetFiles);
            } else if (upBlocks.length > 0) {
                fileMap = buildFileMapFromUpdateBlocks(upBlocks, targetFiles, shaMap);
            } else {
                ctx.onLog('⚠️ No recognised edit block found');
                continue;
            }

            if (!fileMap) continue;

            const passed = await qualityGateWithRetry(ctx, memory, fileMap, targetFiles, shaMap, fullContents);
            if (!passed) {
                ctx.onLog('❌ Quality gate failed after retries');
                return null;
            }

            const commitResult = await GitHubService.commitMultipleFiles(
                ctx.repo, ctx.branch, fileMap,
                `Task: ${task.title}`, ctx.githubToken
            );

            // Post‑commit verification
            for (const [path, info] of Object.entries(fileMap)) {
                const ok = await verifyCommit(ctx, path, commitResult.commitSha);
                if (!ok) {
                    ctx.onLog(`❌ Commit verification failed for ${path}`);
                    return null;
                }
            }

            ctx.onLog(`✅ Committed ${Object.keys(fileMap).length} file(s)`);
            return fileMap;

        } else if (action.type === 'search' && action.query) {
            ctx.onLog(`🔍 Searching web: ${action.query}`);
            try {
                const results = await fetch('/.netlify/functions/firecrawl-proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: action.query, count: 5 })
                }).then(r => r.json());
                const summary = results.map(r => `${r.title}: ${r.url}\n${r.snippet}`).join('\n\n');
                memory.addNote(`Web search results for "${action.query}":\n${summary}`);
                ctx.onLog(`📖 Search results added to memory`);
            } catch (e) {
                memory.addNote(`Web search failed: ${e.message}`);
            }

        } else if (action.type === 'fetch' && action.url) {
            ctx.onLog(`🌐 Fetching: ${action.url}`);
            try {
                const result = await fetch('/.netlify/functions/webfetch-proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: action.url, fullPage: false })
                }).then(r => r.json());
                memory.addFile(action.url, result.content, `Fetched: ${result.content.slice(0, 500)}`);
                memory.addNote(`Fetched ${action.url}: ${result.content.slice(0, 300)}`);
                ctx.onLog(`📖 Fetched ${action.url}`);
            } catch (e) {
                memory.addNote(`Fetch failed: ${e.message}`);
            }

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

function parseAgentAction(text) {
    const t = text.trim();
    if (/<<<<<<< SEARCH/.test(t) || /<skill\s+name=["']update_editor["']/.test(t)) {
        return { type: 'code' };
    }
    if (t.toLowerCase().startsWith('done')) return { type: 'done' };
    const readMatch = t.match(/^READ:\s*(\S+)/i);
    if (readMatch) return { type: 'read', path: readMatch[1] };
    const searchMatch = t.match(/^SEARCH:\s*(.+)/i);
    if (searchMatch) return { type: 'search', query: searchMatch[1] };
    const fetchMatch = t.match(/^FETCH:\s*(\S+)/i);
    if (fetchMatch) return { type: 'fetch', url: fetchMatch[1] };
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
