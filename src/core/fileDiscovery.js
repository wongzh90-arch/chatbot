import { GitHubService } from '../services/github.js';

export async function discoverFiles(ctx, goal) {
    ctx.onLog('🔍 Discovering relevant files from keyword index...');

    let index = null;
    try {
        const { content } = await GitHubService.loadFileContent(
            ctx.repo, ctx.branch, 'keywords.json', ctx.githubToken
        );
        index = JSON.parse(content);
        ctx.onLog('✅ Loaded keywords.json from repo');
    } catch {
        ctx.onLog('⚠️ No keywords.json found — run /index first. Falling back to filename scan.');
    }

    const goalWords = goal.toLowerCase().match(/\b\w{3,}\b/g) || [];
    let scored = [];

    if (index?.files) {
        for (const [filePath, keywords] of Object.entries(index.files)) {
            const hits = keywords.filter(kw =>
                goalWords.some(word =>
                    kw.toLowerCase().includes(word) || word.includes(kw.toLowerCase())
                )
            );
            if (hits.length === 0) continue;

            let content = '';
            try {
                const loaded = await GitHubService.loadFileContent(
                    ctx.repo, ctx.branch, filePath, ctx.githubToken
                );
                content = loaded.content;
            } catch { continue; }

            scored.push({ path: filePath, content, score: hits.length, hits });
        }
    } else {
        const SCAN_EXTS = /\.(js|jsx|html|css|toml|json)$/;
        const SKIP_PATHS = /node_modules|\.min\.|package-lock|yarn\.lock/;
        scored = (ctx.fileTree || [])
            .filter(f => SCAN_EXTS.test(f.path) && !SKIP_PATHS.test(f.path))
            .map(f => {
                const hits = goalWords.filter(w => f.path.toLowerCase().includes(w));
                return { path: f.path, content: '', score: hits.length, hits };
            })
            .filter(f => f.score > 0);
    }

    scored.sort((a, b) => b.score - a.score);
    const result = scored.slice(0, 8);

    const summary = result
        .map(f => `${f.path} (${f.score} hit${f.score > 1 ? 's' : ''}: ${f.hits.slice(0, 3).join(', ')})`)
        .join('\n   ');
    ctx.onLog(`📂 Relevant files:\n   ${summary || 'none found'}`);
    return result;
}
