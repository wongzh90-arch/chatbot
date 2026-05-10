/**
 * searchReplaceHandler – Applies SEARCH/REPLACE or legacy update_editor blocks
 * to build a fileMap ready for commit.
 */
import { SearchReplace } from '../../utils/searchReplace.js';
import { processAgentSkills } from '../../utils/agentSkills.js';
import { stripComments } from '../../utils/stripComments.js';
import { LLMProvider } from '../../services/llmProvider.js';

export async function applySearchReplaceEdits(ctx, srBlocks, fullContents, shaMap, targetFiles) {
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
            ctx.onLog(`🔧 SEARCH/REPLACE match failed for ${path}:\n${result.errors[0].message}`);
            await retrySearchReplace(ctx, path, original, blocks, result.errors);
            return null;
        }

        const isJsCss = /\.(js|jsx|mjs|cjs|ts|tsx|css|scss|less)$/i.test(path);
        const finalContent = isJsCss ? stripComments(result.newContent) : result.newContent;
        fileMap[path] = {
            content: finalContent,
            sha: shaMap[path] || null
        };
        fullContents[path] = finalContent;
        ctx.onLog(`📝 Prepared edit for ${path} via SEARCH/REPLACE`);
    }
    return fileMap;
}

async function retrySearchReplace(ctx, filePath, original, blocks, errors) {
    const errorMsg = errors.map(e => e.message).join('\n');
    const feedbackPrompt = `Your SEARCH/REPLACE blocks for ${filePath} failed with these errors:\n\n${errorMsg}\n\nCurrent file content (first 1000 chars):\n${original.slice(0, 1000)}\n\nPlease provide corrected SEARCH/REPLACE blocks that exactly match existing lines.`;
    const { content } = await LLMProvider.fastCompletion({
        provider: ctx.provider,
        messages: [],
        userContent: feedbackPrompt,
        timeoutMs: 15000
    });
    const { actions } = processAgentSkills(content);
    if (actions.searchReplaceBlocks.length) {
        // Inject corrected blocks back into the next turn
        ctx._pendingSRBlocks = actions.searchReplaceBlocks;
    }
}

export function buildFileMapFromUpdateBlocks(blocks, targetFiles, shaMap) {
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
