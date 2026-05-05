window.GitHubService = (() => {
    function headers(token) {
        return {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };
    }

    async function fetchFileTree(repo, branch, token) {
        const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`, { headers: headers(token) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.tree.filter(f => f.type === 'blob');
    }

    async function loadFileContent(repo, branch, path, token) {
        const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`, { headers: headers(token) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const decoded = atob(data.content).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('');
        return {
            path,
            content: decodeURIComponent(decoded),
            sha: data.sha
        };
    }

    async function commitFile(repo, branch, path, content, sha, message, token) {
        const encoded = btoa(unescape(encodeURIComponent(content)));
        const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
            method: 'PUT',
            headers: headers(token),
            body: JSON.stringify({ message, content: encoded, sha, branch })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        return await res.json();
    }

    async function getRepoInfo(repo, token) {
        const res = await fetch(`https://api.github.com/repos/${repo}`, { headers: headers(token) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    async function createBranch(repo, sourceBranch, newBranch, token) {
        const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${sourceBranch}`, { headers: headers(token) });
        if (!refRes.ok) throw new Error(`Source branch not found`);
        const sha = (await refRes.json()).object.sha;
        const createRes = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
            method: 'POST',
            headers: headers(token),
            body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha })
        });
        // 422 = branch already exists, just use it
        if (!createRes.ok && createRes.status !== 422) {
            throw new Error((await createRes.json()).message);
        }
        return newBranch;
    }

    async function createPullRequest(repo, headBranch, title, baseBranch, token) {
        const base = baseBranch || (await getRepoInfo(repo, token)).default_branch;
        const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
            method: 'POST',
            headers: headers(token),
            body: JSON.stringify({ title, head: headBranch, base })
        });
        if (!res.ok) throw new Error((await res.json()).message);
        return res.json();
    }

    async function branchExists(repo, branch, token) {
        const res = await fetch(`https://api.github.com/repos/${repo}/branches/${branch}`, { headers: headers(token) });
        return res.ok;
    }

    async function resetBranch(repo, branch, sourceBranch, token) {
        const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${sourceBranch}`, { headers: headers(token) });
        if (!refRes.ok) throw new Error(`Source branch ${sourceBranch} not found`);
        const sha = (await refRes.json()).object.sha;
        const updateRes = await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/${branch}`, {
            method: 'PATCH',
            headers: headers(token),
            body: JSON.stringify({ sha, force: true }),
        });
        if (!updateRes.ok) throw new Error(`Reset failed: ${await updateRes.text()}`);
    }

    return { fetchFileTree, loadFileContent, commitFile, createBranch, createPullRequest, branchExists, getRepoInfo, resetBranch };
})();
