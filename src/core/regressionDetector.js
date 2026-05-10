/**
 * regressionDetector – Finds files that import changed files and
 * checks that the symbols they expect still exist.
 */
import { GitHubService } from '../services/github.js';
import { LLMProvider } from '../services/llmProvider.js';

export async function detectRegressions(ctx, changedPaths) {
    if (!ctx.manifest) return [];

    const affectedPaths = new Set();
    for (const cp of changedPaths) {
        const entry = ctx.manifest[cp];
        if (entry?.importedBy) {
            entry.importedBy.forEach(p => affectedPaths.add(p));
        }
    }

    if (affectedPaths.size === 0) return [];

    ctx.onLog(`🔗 Checking ${affectedPaths.size} files for regressions...`);
    const regressions = [];

    for (const ap of affectedPaths) {
        let consumerContent = '';
        try {
            const { content } = await GitHubService.loadFileContent(
                ctx.repo, ctx.branch, ap, ctx.githubToken
            );
            consumerContent = content;
        } catch { continue; }

        const changedFilesContext = [];
        for (const cp of changedPaths) {
            if (ctx.manifest[cp]) {
                changedFilesContext.push(
                    `- ${cp}: exports [${ctx.manifest[cp].exports.join(', ')}]`
                );
            }
        }

        const prompt = `File "${ap}" depends on these files that were just changed:
${changedFilesContext.join('\n')}

Content of ${ap}:
${consumerContent.slice(0, 3000)}

Check: Does ${ap} use any symbols from the changed files that might no longer exist?
Reply with ONLY:
- NO_REGRESSION
- REGRESSION: <list each missing symbol with line number>`;

        const { content } = await LLMProvider.fastCompletion({
            provider: ctx.provider,
            messages: [],
            userContent: prompt,
            timeoutMs: 10000
        });

        if (content.trim().startsWith('REGRESSION')) {
            regressions.push({ file: ap, detail: content.trim() });
        }
    }

    if (regressions.length) {
        ctx.onLog(`⚠️ ${regressions.length} regression(s) detected: ${regressions.map(r => r.file).join(', ')}`);
    }
    return regressions;
}
