/**
 * chunkedIndexer – Builds a keyword index for large repositories by processing
 * files in groups of 5. For each file, extracts 5‑10 keywords and also stores
 * a short summary (first 500 chars). Robust JSON extraction with retry on timeout.
 * The resulting keywords.json is committed back to the repo.
 */
import { GitHubService } from '../services/github.js';
import { LLMProvider } from '../services/llmProvider.js';

function extractJsonObject(text) {
    const cleaned = text
        .replace(/```json|```/g, '')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
        throw new Error('No JSON object found');
    }
    return cleaned.slice(start, end + 1);
}

export async function chunkedBuildIndex(ctx) {
    const scannable = (ctx.fileTree || []).filter(f =>
        /\.(js|jsx|html|css|toml|json)$/.test(f.path) &&
        !/node_modules|\.min\.|package-lock|yarn\.lock/.test(f.path)
    );

    const groups = chunk(scannable, 5);
    const mergedIndex = { files: {} };
    ctx.onLog(`🔢 Total files to index: ${scannable.length}. Groups: ${groups.length}`);

    for (const group of groups) {
        const groupIndex = groups.indexOf(group) + 1;
        ctx.onLog(`🔍 Indexing group ${groupIndex} of ${groups.length} (${group.length} files)…`);

        const fileContents = [];
        for (const f of group) {
            try {
                const { content } = await GitHubService.loadFileContent(
                    ctx.repo, ctx.branch, f.path, ctx.githubToken
                );
                fileContents.push({ path: f.path, content: content.slice(0, 2000) });
            } catch { /* skip unreachable files */ }
        }

        if (!fileContents.length) {
            ctx.onLog(`⏭ Group ${groupIndex} empty, skipped`);
            if (ctx.onProgress) ctx.onProgress(Math.round((groupIndex / groups.length) * 100));
            continue;
        }

        const prompt = `For each file, extract 5‑10 specific keywords AND a one‑sentence summary (first 500 chars). Return JSON:
{ "files": { "path/to/file": { "keywords": ["kw1","kw2"], "summary": "..." } } }
Files:
${fileContents.map(f => `### ${f.path}\n${f.content}`).join('\n\n')}`;

        let content = null;
        let success = false;

        try {
            const result = await LLMProvider.chatCompletion({
                provider: ctx.provider,
                model: ctx.model,
                messages: [],
                systemPrompt: 'You are a code indexer. Output only valid JSON, no markdown.',
                userContent: prompt,
                thinkingMode: false,
                timeoutMs: 30000
            });
            content = result.content;
            success = true;
        } catch (err) {
            ctx.onLog(`⚠️ Group ${groupIndex}: First attempt failed (${err.message}). Trying with fast model...`);
        }

        if (!success) {
            try {
                const result = await LLMProvider.fastCompletion({
                    provider: ctx.provider,
                    messages: [],
                    userContent: prompt,
                    timeoutMs: 35000
                });
                content = result.content;
                success = true;
            } catch (err) {
                ctx.onLog(`❌ Group ${groupIndex}: Fallback also failed: ${err.message}. Skipping this group.`);
                if (ctx.onProgress) ctx.onProgress(Math.round((groupIndex / groups.length) * 100));
                continue;
            }
        }

        try {
            const jsonStr = extractJsonObject(content);
            const partial = JSON.parse(jsonStr);
            for (const [path, data] of Object.entries(partial.files)) {
                mergedIndex.files[path] = {
                    keywords: Array.isArray(data) ? data : (data.keywords || []),
                    summary: data.summary || ''
                };
            }
            ctx.onLog(`✔ Group ${groupIndex} indexed successfully`);
        } catch (e) {
            ctx.onLog(`⚠️ Group ${groupIndex}: Chunk parse error: ${e.message}. Skipping.`);
        }

        if (ctx.onProgress) ctx.onProgress(Math.round((groupIndex / groups.length) * 100));
    }

    const fileMap = {
        'keywords.json': { content: JSON.stringify(mergedIndex, null, 2), sha: null }
    };
    try {
        const existing = await GitHubService.loadFileContent(
            ctx.repo, ctx.branch, 'keywords.json', ctx.githubToken
        );
        fileMap['keywords.json'].sha = existing.sha;
    } catch { /* file doesn't exist yet */ }

    await GitHubService.commitMultipleFiles(
        ctx.repo, ctx.branch, fileMap,
        'chore: chunked keyword index', ctx.githubToken
    );
    ctx.onLog(`✅ Indexed ${Object.keys(mergedIndex.files).length} files`);
}

function chunk(arr, size) {
    const result = [];
    for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
    return result;
}
