/**
 * chunkedIndexer – Builds a keyword index for large repositories by processing
 * files in groups of 10. For each file, extracts 5‑10 keywords and also stores
 * a short summary (first 500 chars). All LLM calls are fast‑completion.
 * The resulting keywords.json is committed back to the repo.
 */
import { GitHubService } from '../services/github.js';
import { LLMProvider } from '../services/llmProvider.js';

export async function chunkedBuildIndex(ctx) {
    const scannable = (ctx.fileTree || []).filter(f =>
        /\.(js|jsx|html|css|toml|json)$/.test(f.path) &&
        !/node_modules|\.min\.|package-lock|yarn\.lock/.test(f.path)
    );

    const groups = chunk(scannable, 10);
    const mergedIndex = { files: {} };

    for (const group of groups) {
        const fileContents = [];
        for (const f of group) {
            try {
                const { content } = await GitHubService.loadFileContent(
                    ctx.repo, ctx.branch, f.path, ctx.githubToken
                );
                fileContents.push({
                    path: f.path,
                    content: content.slice(0, 2000)
                });
            } catch { /* skip */ }
        }

        if (!fileContents.length) continue;

        const prompt = `For each file, extract 5‑10 specific keywords AND a one‑sentence summary (first 500 chars). Return JSON:
{ "files": { "path/to/file": { "keywords": ["kw1","kw2"], "summary": "..." } } }
Files:
${fileContents.map(f => `### ${f.path}\n${f.content}`).join('\n\n')}`;

        const { content } = await LLMProvider.fastCompletion({
            provider: ctx.provider,
            messages: [],
            userContent: prompt,
            timeoutMs: 20000
        });

        try {
            const partial = JSON.parse(content.replace(/```json|```/g, '').trim());
            for (const [path, data] of Object.entries(partial.files)) {
                mergedIndex.files[path] = {
                    keywords: Array.isArray(data) ? data : (data.keywords || []),
                    summary: data.summary || ''
                };
            }
        } catch (e) {
            ctx.onLog(`⚠️ Chunk parse error: ${e.message}`);
        }
    }

    // Commit merged index
    const fileMap = {
        'keywords.json': { content: JSON.stringify(mergedIndex, null, 2), sha: null }
    };
    try {
        const existing = await GitHubService.loadFileContent(
            ctx.repo, ctx.branch, 'keywords.json', ctx.githubToken
        );
        fileMap['keywords.json'].sha = existing.sha;
    } catch {}
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
