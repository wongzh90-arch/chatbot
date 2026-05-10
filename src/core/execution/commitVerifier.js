/**
 * commitVerifier – Re‑reads a committed file to verify its SHA matches.
 */
import { GitHubService } from '../../services/github.js';

export async function verifyCommit(ctx, path, expectedSha) {
    try {
        const { sha: actualSha } = await GitHubService.loadFileContent(
            ctx.repo, ctx.branch, path, ctx.githubToken
        );
        if (actualSha !== expectedSha) {
            ctx.onLog(`⚠️ SHA mismatch for ${path}: expected ${expectedSha.slice(0, 7)}, got ${actualSha.slice(0, 7)}`);
            return false;
        }
        return true;
    } catch (e) {
        ctx.onLog(`⚠️ Post‑commit verify failed for ${path}: ${e.message}`);
        return false;
    }
}
