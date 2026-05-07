================================================
// js/state/useGitHubActions.js
// Owns: file tree, GitHub read/write operations.
// NOTE: activeFilePath / activeFileContent / fileSha are GONE.
//       loadFile() now returns { path, content, sha } — caller pushes to messages.
//       commitChange() takes explicit (path, content, sha, message) args.
window.useGitHubActions = function useGitHubActions({
  currentRepo,
  currentBranch,
  setCurrentBranch,
  githubToken,
  deployHook,
  workspace,
  addToast,
}) {
  const { useState } = React;
  const [fileTree,          setFileTree]          = useState([]);
  const [isLoading,         setIsLoading]         = useState(false);
  const [recentlyModified,  setRecentlyModified]  = useState(() => new Set());
  const markModified = (path) => {
    setRecentlyModified(prev => new Set([...prev, path]));
  };
  // ── File tree ─────────────────────────────────────────────────
  const fetchFileTree = async () => {
    if (!currentRepo || !githubToken) {
      addToast('Missing repo or token', 'error');
      return;
    }
    setIsLoading(true);
    try {
      const files = await window.GitHubService.fetchFileTree(
        currentRepo, currentBranch, githubToken
      );
      setFileTree(files);
      addToast('File tree updated', 'success');
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };
  // ── Load single file — returns content, does NOT set state ────
  const loadFile = async (path) => {
    setIsLoading(true);
    try {
      const { content, sha } = await window.GitHubService.loadFileContent(
        currentRepo, currentBranch, path, githubToken
      );
      return { path, content, sha };
    } catch (e) {
      addToast(e.message, 'error');
      return null;
    } finally {
      setIsLoading(false);
    }
  };
  // ── Commit a single file explicitly ──────────────────────────
  // Returns { newSha } on success, null on failure
  const commitChange = async (path, content, sha, customMessage) => {
    if (!path) { addToast('No file path provided', 'error'); return null; }
    setIsLoading(true);
    try {
      const msg    = customMessage || `Agent update: ${path}`;
      const result = await window.GitHubService.commitFile(
        currentRepo, currentBranch, path, content, sha, msg, githubToken
      );
      markModified(path);
      addToast(`Committed ${path.split('/').pop()}`, 'success');
      if (workspace === 'self' && deployHook) {
        try {
          await fetch(deployHook, { method: 'POST' });
          addToast('Redeploy triggered!', 'success');
        } catch {
          addToast('Deploy hook failed', 'error');
        }
      }
      return { newSha: result.content.sha };
    } catch (e) {
      addToast(e.message, 'error');
      return null;
    } finally {
      setIsLoading(false);
    }
  };
  // ── Phase 1D: multi-file atomic commit via Git Trees API ─────
  // fileMap: { [path]: { content: string } }
  // Returns { commitSha, filesCommitted } on success, null on failure.
  const commitMultipleFiles = async (fileMap, message) => {
    if (!fileMap || Object.keys(fileMap).length === 0) {
      addToast('commitMultipleFiles: empty fileMap', 'error');
      return null;
    }
    // Single-file shortcut — avoid extra API calls
    const paths = Object.keys(fileMap);
    if (paths.length === 1) {
      const [path] = paths;
      const { content, sha } = fileMap[path];
      const result = await commitChange(path, content, sha, message);
      if (!result) return null;
      return { commitSha: result.newSha, filesCommitted: [path] };
    }
    setIsLoading(true);
    try {
      const result = await window.GitHubService.commitMultipleFiles(
        currentRepo, currentBranch, fileMap, message || 'Agent: multi-file update', githubToken
      );
      paths.forEach(p => markModified(p));
      addToast(`Committed ${paths.length} files atomically`, 'success');
      if (workspace === 'self' && deployHook) {
        try {
          await fetch(deployHook, { method: 'POST' });
          addToast('Redeploy triggered!', 'success');
        } catch {
          addToast('Deploy hook failed', 'error');
        }
      }
      return result;
    } catch (e) {
      addToast(`Multi-file commit failed: ${e.message}`, 'error');
      return null;
    } finally {
      setIsLoading(false);
    }
  };
  // ── Branch operations ─────────────────────────────────────────
  const handleCreateBranch = async (branchName) => {
    try {
      await window.GitHubService.createBranch(
        currentRepo, currentBranch, branchName, githubToken
      );
      setCurrentBranch(branchName);
      addToast(`Branch ${branchName} created`, 'success');
      fetchFileTree();
      return true;
    } catch (e) {
      addToast(e.message, 'error');
      return false;
    }
  };
  const handleSwitchBranch = async (branch) => {
    const exists = await window.GitHubService.branchExists(
      currentRepo, branch, githubToken
    );
    if (!exists) { addToast('Branch not found', 'error'); return; }
    setCurrentBranch(branch);
    setFileTree([]);
    setRecentlyModified(new Set());
    fetchFileTree();
    addToast(`Switched to ${branch}`, 'success');
  };
  const handleCreatePR = async (title, base) => {
    try {
      const pr = await window.GitHubService.createPullRequest(
        currentRepo, currentBranch, title, base, githubToken
      );
      addToast('PR created', 'success');
      return pr.html_url;
    } catch (e) {
      addToast(e.message, 'error');
      return null;
    }
  };
  return {
    fileTree,
    isLoading,
    recentlyModified,
    fetchFileTree,
    loadFile,
    commitChange,
    commitMultipleFiles,
    handleCreateBranch,
    handleSwitchBranch,
    handleCreatePR,
  };
};
