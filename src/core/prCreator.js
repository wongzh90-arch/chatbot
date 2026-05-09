import { GitHubService } from '../services/github.js';

export async function createPR(ctx, goal) {
    const title = `Self‑improve: ${goal.slice(0, 60)}`;
    const pr = await GitHubService.createPullRequest(
        ctx.repo, ctx.branch, title, null, ctx.githubToken
    );
    return pr.html_url;
}
