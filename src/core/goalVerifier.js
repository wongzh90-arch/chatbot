/**
 * goalVerifier – Compares the feature‑branch diff against the original goal.
 * Returns { achieved: boolean, reason: string }.
 */
import { GitHubService } from '../services/github.js';
import { LLMProvider } from '../services/llmProvider.js';

export async function verifyGoal(ctx, goal) {
    if (!ctx.changeBranch) {
        ctx.onLog('⚠️ No feature branch – skipping goal verification');
        return { achieved: true };
    }

    // 1. Fetch diff between base branch and feature branch
    let diff = '';
    try {
        diff = await GitHubService.compareCommits(
            ctx.repo, ctx.originalBranch, ctx.changeBranch, ctx.githubToken
        );
    } catch (e) {
        ctx.onLog(`⚠️ Could not fetch diff for verification: ${e.message}`);
        return { achieved: true }; // fail open
    }

    if (!diff.trim()) {
        ctx.onLog('⚠️ Empty diff – cannot verify goal, assuming achieved');
        return { achieved: true };
    }

    // 2. Ask LLM
    const prompt = `Goal: "${goal}"

Below is the diff of all changes made on the feature branch:

${diff.slice(0, 6000)}

Does this diff achieve the goal? Reply with:
- ACHIEVED: (one sentence why)
- NOT_ACHIEVED: (specific reason, mention what is missing)`;

    const { content } = await LLMProvider.fastCompletion({
        provider: ctx.provider,
        messages: [],
        userContent: prompt,
        timeoutMs: 15000
    });

    const verdict = content.trim();
    const achieved = verdict.toUpperCase().startsWith('ACHIEVED');
    ctx.onLog(`🎯 Goal verification: ${achieved ? 'ACHIEVED' : 'NOT_ACHIEVED'} – ${verdict.slice(0, 120)}`);

    return { achieved, reason: verdict };
}
