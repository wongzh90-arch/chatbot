import { GitHubService } from '../services/github.js';
import { ManifestBuilder } from '../utils/manifestBuilder.js';

export async function ensureManifest(ctx) {
    if (ctx.manifest) return;
    try {
        const { content } = await GitHubService.loadFileContent(
            ctx.repo, ctx.branch, 'manifest.json', ctx.githubToken
        );
        ctx.manifest = JSON.parse(content);
        ctx.onLog('✅ Manifest loaded from repo');
        return;
    } catch {
        ctx.onLog('⚠️ No manifest.json – building from source...');
    }

    if (!ctx.fileTree) await ctx.fetchFileTree();

    const jsPaths = ctx.fileTree
        .filter(f => /\.(js|jsx)$/.test(f.path))
        .map(f => f.path);

    const fileContents = [];
    for (const p of jsPaths) {
        try {
            const { content } = await GitHubService.loadFileContent(
                ctx.repo, ctx.branch, p, ctx.githubToken
            );
            fileContents.push({ path: p, content });
        } catch { /* skip */ }
    }

    ctx.manifest = ManifestBuilder.buildFromFiles(fileContents);
    ctx.onLog('✅ Manifest built from source');
}
