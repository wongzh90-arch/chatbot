import { GitHubService } from '../services/github.js';
import { LLMProvider } from '../services/llmProvider.js';

export async function buildKeywordIndex(ctx) {
    ctx.onLog('📂 Reading all scannable files...');

    const SCAN_EXTS = /\.(js|jsx|html|css|toml|json)$/;
    const SKIP_PATHS = /node_modules|\.min\.|package-lock|yarn\.lock/;
    const candidates = (ctx.fileTree || [])
        .filter(f => SCAN_EXTS.test(f.path) && !SKIP_PATHS.test(f.path));

    const fileContents = [];
    for (const f of candidates) {
        try {
            const { content } = await GitHubService.loadFileContent(
                ctx.repo, ctx.branch, f.path, ctx.githubToken
            );
            fileContents.push({ path: f.path, content: content.slice(0, 4000) });
        } catch { continue; }
    }

    ctx.onLog(`📝 Extracting keywords from ${fileContents.length} files via LLM...`);

    const prompt = `You are indexing a codebase. For each file below, extract 5-15 specific keywords that would help find this file when searching for related code changes.
Include: CSS property names, variable names, function/class names, HTML element ids, string literals, feature names.
Return ONLY a JSON object: { "files": { "path/to/file": ["keyword1", "keyword2", ...], ... } }

Files:
${fileContents.map(f => `### ${f.path}\n${f.content}`).join('\n\n')}`;

    const reply = await LLMProvider.chatCompletion({
        provider: ctx.provider,
        model: ctx.model,
        messages: [],
        systemPrompt: 'You extract keywords from code files. Output only JSON, no markdown.',
        userContent: prompt,
        thinkingMode: false
    });

    let index;
    try {
        index = JSON.parse(reply.content.replace(/```json|```/g, '').trim());
    } catch (e) {
        ctx.onLog(`❌ Failed to parse keyword index: ${e.message}`);
        return;
    }

    const fileMap = {
        'keywords.json': {
            content: JSON.stringify(index, null, 2),
            sha: null
        }
    };

    try {
        const existing = await GitHubService.loadFileContent(
            ctx.repo, ctx.branch, 'keywords.json', ctx.githubToken
        );
        fileMap['keywords.json'].sha = existing.sha;
    } catch { /* file doesn't exist */ }

    await GitHubService.commitMultipleFiles(
        ctx.repo, ctx.branch, fileMap,
        'chore: update keyword index', ctx.githubToken
    );

    ctx.onLog(`✅ keywords.json committed — ${Object.keys(index.files || {}).length} files indexed`);
}
