/**
 * chunkedIndexer – Builds a keyword index for large repositories by processing
 * files in groups of 5. For each file, extracts 5‑10 keywords and also stores
 * a short summary (first 500 chars). Robust JSON extraction with retry on timeout.
 * The resulting keywords.json is committed back to the repo.
 */
import { GitHubService } from '../services/github.js';
import { LLMProvider } from '../services/llmProvider.js';

/**
 * Robust JSON extraction: find the outermost { ... } block.
 * Removes markdown fences and any text outside the JSON.
 */
function extractJsonObject(text) {
    const cleaned = text
        .replace(/```json|```/g, '')     // drop markdown fences
        .replace(/\/\/[^\n]*/g, '')      // remove single-line comments
        .replace(/,\s*}/g, '}')          // remove trailing commas in objects
        .replace(/,\s*]/g, ']')          // remove trailing commas in arrays
        .trim();

    // Find the outermost { }
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

    const groups = chunk(scannable, 5);   // smaller chunks = faster replies
    const mergedIndex = { files: {} };

    for (const group of groups) {
        // Gather file contents for this chunk
        const fileContents = [];
        for (const f of group) {
            try {
                const { content } = await GitHubService.loadFileContent(
                    ctx.repo, ctx.branch, f.path, ctx.githubToken
                );
                fileContents.push({
                    path: f.path,
                    content: content.slice(0, 2000)   // keep prompt short
                });
            } catch { /* skip unreachable files */ }
        }

        if (!fileContents.length) continue;

        const prompt = `For each file, extract 5‑10 specific keywords AND a one‑sentence summary (first 500 chars). Return JSON:
{ "files": { "path/to/file": { "keywords": ["kw1","kw2"], "summary": "..." } } }
Files:
${fileContents.map(f => `### ${f.path}\n${f.content}`).join('\n\n')}`;

        // Attempt 1: use the user’s selected model (may be slower but smarter)
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
                timeoutMs: 30000            // 30 seconds for normal model
            });
            content = result.content;
            success = true;
        } catch (err) {
            ctx.onLog(`⚠️ First attempt failed (${err.message}). Trying with fast model...`);
        }

        // Attempt 2 (fallback): cheap fast model with longer timeout
        if (!success) {
            try {
                const result = await LLMProvider.fastCompletion({
                    provider: ctx.provider,
                    messages: [],
                    userContent: prompt,
                    timeoutMs: 35000         // 35 seconds for fallback
                });
                content = result.content;
                success = true;
            } catch (err) {
                ctx.onLog(`❌ Fallback also failed: ${err.message}. Skipping chunk of ${group.length} files.`);
                continue;
            }
        }

        // Parse the response
        try {
            const jsonStr = extractJsonObject(content);
            const partial = JSON.parse(jsonStr);
            for (const [path, data] of Object.entries(partial.files)) {
                mergedIndex.files[path] = {
                    keywords: Array.isArray(data) ? data : (data.keywords || []),
                    summary: data.summary || ''
                };
            }
        } catch (e) {
            ctx.onLog(`⚠️ Chunk parse error: ${e.message}. Skipping chunk of ${group.length} files.`);
        }
    }

    // Commit the merged index to the repo
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
