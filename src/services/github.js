export class GitHubService {
    static headers(token) {
        return {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };
    }

    static async fetchFileTree(repo, branch, token) {
        const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`, { headers: this.headers(token) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.tree.filter(f => f.type === 'blob');
    }

    static async loadFileContent(repo, branch, path, token) {
        const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`, { headers: this.headers(token) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const binary = atob(data.content);
        const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
        const content = new TextDecoder('utf-8').decode(bytes);
        return { content, sha: data.sha };
    }

    static async commitMultipleFiles(repo, branch, fileMap, message, token) {
        const base = `https://api.github.com/repos/${repo}`;
        const h = this.headers(token);
        const refRes = await fetch(`${base}/git/ref/heads/${branch}`, { headers: h });
        if (!refRes.ok) throw new Error(`Could not get branch ref`);
        const currentCommitSha = (await refRes.json()).object.sha;
        const commitRes = await fetch(`${base}/git/commits/${currentCommitSha}`, { headers: h });
        const baseTreeSha = (await commitRes.json()).tree.sha;
        const tree = Object.entries(fileMap).map(([path, { content }]) => ({
            path, mode: '100644', type: 'blob', content
        }));
        const newTreeRes = await fetch(`${base}/git/trees`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ base_tree: baseTreeSha, tree })
        });
        if (!newTreeRes.ok) throw new Error(`Could not create tree`);
        const newTreeSha = (await newTreeRes.json()).sha;
        const newCommitRes = await fetch(`${base}/git/commits`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ message, tree: newTreeSha, parents: [currentCommitSha] })
        });
        const newCommitSha = (await newCommitRes.json()).sha;
        const updateRes = await fetch(`${base}/git/refs/heads/${branch}`, {
            method: 'PATCH', headers: h,
            body: JSON.stringify({ sha: newCommitSha })
        });
        if (!updateRes.ok && updateRes.status !== 422) throw new Error(`Could not update branch`);
        return { commitSha: newCommitSha };
    }

    /**
     * Create a new branch from the given source branch.
     */
    static async createBranch(repo, newBranch, sourceBranch, token) {
        const base = `https://api.github.com/repos/${repo}`;
        const h = this.headers(token);
        // Get the SHA of the source branch's latest commit
        const refRes = await fetch(`${base}/git/ref/heads/${sourceBranch}`, { headers: h });
        if (!refRes.ok) throw new Error(`Could not get source branch: ${await refRes.text()}`);
        const sha = (await refRes.json()).object.sha;
        // Create the new branch
        const createRes = await fetch(`${base}/git/refs`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha })
        });
        if (!createRes.ok) throw new Error(`Could not create branch: ${await createRes.text()}`);
        return newBranch;
    }

    // Add this static method to the GitHubService class
    static async compareCommits(repo, base, head, token) {
        const res = await fetch(
            `https://api.github.com/repos/${repo}/compare/${base}...${head}`,
            { headers: this.headers(token) }
        );
        if (!res.ok) throw new Error(`Compare API error: ${res.status}`);
        const data = await res.json();
        return data.diff || '';
    }
    
    static async createPullRequest(repo, headBranch, title, baseBranch, token) {
        let base = baseBranch;
        if (!base) {
            const repoInfo = await fetch(`https://api.github.com/repos/${repo}`, { headers: this.headers(token) });
            const info = await repoInfo.json();
            base = info.default_branch || 'main';
        }
        const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
            method: 'POST',
            headers: this.headers(token),
            body: JSON.stringify({ title, head: headBranch, base, draft: false })
        });
        if (!res.ok) throw new Error(`PR creation failed: ${await res.text()}`);
        return res.json();
    }
}
