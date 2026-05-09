// GitHubService as ES module
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
        const decoded = atob(data.content);
        return { content: decodeURIComponent(escape(decoded)), sha: data.sha };
    }

    static async commitMultipleFiles(repo, branch, fileMap, message, token) {
        const base = `https://api.github.com/repos/${repo}`;
        const h = this.headers(token);
        // Get current commit SHA
        const refRes = await fetch(`${base}/git/ref/heads/${branch}`, { headers: h });
        if (!refRes.ok) throw new Error(`Could not get branch ref`);
        const currentCommitSha = (await refRes.json()).object.sha;
        // Get base tree
        const commitRes = await fetch(`${base}/git/commits/${currentCommitSha}`, { headers: h });
        const baseTreeSha = (await commitRes.json()).tree.sha;
        // Create tree
        const tree = Object.entries(fileMap).map(([path, { content }]) => ({
            path, mode: '100644', type: 'blob', content
        }));
        const newTreeRes = await fetch(`${base}/git/trees`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ base_tree: baseTreeSha, tree })
        });
        if (!newTreeRes.ok) throw new Error(`Could not create tree`);
        const newTreeSha = (await newTreeRes.json()).sha;
        // Create commit
        const newCommitRes = await fetch(`${base}/git/commits`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ message, tree: newTreeSha, parents: [currentCommitSha] })
        });
        const newCommitSha = (await newCommitRes.json()).sha;
        // Update branch
        const updateRes = await fetch(`${base}/git/refs/heads/${branch}`, {
            method: 'PATCH', headers: h,
            body: JSON.stringify({ sha: newCommitSha })
        });
        if (!updateRes.ok && updateRes.status !== 422) throw new Error(`Could not update branch`);
        return { commitSha: newCommitSha };
    }

    static async createPullRequest(repo, headBranch, title, baseBranch, token) {
        const base = baseBranch || (await (await fetch(`https://api.github.com/repos/${repo}`, { headers: this.headers(token) })).json()).default_branch;
        const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
            method: 'POST', headers: this.headers(token),
            body: JSON.stringify({ title, head: headBranch, base, draft: false })
        });
        if (!res.ok) throw new Error(`PR creation failed: ${await res.text()}`);
        return res.json();
    }
}
