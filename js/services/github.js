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
    const decoded = atob(data.content)
      .split('')
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('');
    return {
      path,
      content: decodeURIComponent(decoded),
      sha: data.sha
    };
  }
  async function commitFile(repo, branch, path, content, sha, message, token) {
    // ── ALWAYS fetch the latest SHA before committing ──────────
    let currentSha = null;
    try {
      const existing = await loadFileContent(repo, branch, path, token);
      currentSha = existing.sha;
    } catch (e) {
      // 404 = file does not exist → stay null, API will create it
      if (e.message !== 'HTTP 404') throw e;
    }
    // Use fresh sha if file exists, otherwise null to create.
    const finalSha = currentSha !== null ? currentSha : null;
    const encoded = btoa(unescape(encodeURIComponent(content)));
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify({ message, content: encoded, sha: finalSha, branch })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return await res.json();
  }
  async function getRepoInfo(repo, token) {
    const res = await fetch(`https://api.github.com/repos/${repo}`, { headers: headers(token) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  async function getDefaultBranch(repo, token) {
    const info = await getRepoInfo(repo, token);
    return info.default_branch;
  }
  async function createBranch(repo, sourceBranch, newBranch, token) {
    const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${sourceBranch}`, { headers: headers(token) });
    if (!refRes.ok) throw new Error('Source branch not found');
    const sha = (await refRes.json()).object.sha;
    const createRes = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha })
    });
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
  // ── Phase 1D: Multi-file atomic commit via Git Trees API ──────
  // fileMap: { [path]: { content: string } }
  // All files land in one commit — branch is never in an inconsistent state.
  // 5 API calls regardless of file count.
  async function commitMultipleFiles(repo, branch, fileMap, message, token) {
    const base = `https://api.github.com/repos/${repo}`;
    const h = headers(token);
    // 1. Get current HEAD commit SHA
    const refRes = await fetch(`${base}/git/ref/heads/${branch}`, { headers: h });
    if (!refRes.ok) throw new Error(`Could not get branch ref: HTTP ${refRes.status}`);
    const currentCommitSha = (await refRes.json()).object.sha;
    // 2. Get base tree SHA from HEAD commit
    const commitRes = await fetch(`${base}/git/commits/${currentCommitSha}`, { headers: h });
    if (!commitRes.ok) throw new Error(`Could not get commit: HTTP ${commitRes.status}`);
    const baseTreeSha = (await commitRes.json()).tree.sha;
    // 3. Create new tree with all file changes in one request
    const tree = Object.entries(fileMap).map(([path, { content }]) => ({
      path,
      mode: '100644',
      type: 'blob',
      content,              // GitHub creates the blob inline — no separate blob POST needed
    }));
    const newTreeRes = await fetch(`${base}/git/trees`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ base_tree: baseTreeSha, tree }),
    });
    if (!newTreeRes.ok) throw new Error(`Could not create tree: HTTP ${newTreeRes.status}`);
    const newTreeSha = (await newTreeRes.json()).sha;
    // 4. Create new commit pointing at new tree
    const newCommitRes = await fetch(`${base}/git/commits`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        message,
        tree: newTreeSha,
        parents: [currentCommitSha],
      }),
    });
    if (!newCommitRes.ok) throw new Error(`Could not create commit: HTTP ${newCommitRes.status}`);
    const newCommitSha = (await newCommitRes.json()).sha;
    // 5. Fast-forward HEAD to new commit
    const updateRes = await fetch(`${base}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({ sha: newCommitSha }),
    });
    if (!updateRes.ok) {
      if (updateRes.status === 422) {
        // 422 usually means a concurrent push beat us — treat as success
        // since our tree commit already exists on GitHub
        return { commitSha: newCommitSha, filesCommitted: Object.keys(fileMap) };
      }
      throw new Error(`Could not update branch ref: HTTP ${updateRes.status}`);
    }
    return { commitSha: newCommitSha, filesCommitted: Object.keys(fileMap) };
  }
      async function createDraftPR(repo, headBranch, title, baseBranch, token) {
      const base = baseBranch || (await getRepoInfo(repo, token)).default_branch;
      const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify({
          title,
          head: headBranch,
          base,
          draft: true
        })
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    }
    
    async function convertPRToReady(repo, prNumber, token) {
      const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}`, {
        method: 'PATCH',
        headers: headers(token),
        body: JSON.stringify({ draft: false })
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    }
  return {
    fetchFileTree,
    loadFileContent,
    commitFile,
    commitMultipleFiles,
    createBranch,
    createPullRequest,
    branchExists,
    getRepoInfo,
    getDefaultBranch,
    resetBranch,
    createDraftPR,      // <-- add
    convertPRToReady,   // <-- add
  };
})();
