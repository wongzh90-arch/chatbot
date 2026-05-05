// Replace the existing commitFile implementation with this:

function base64Encode(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  return btoa(String.fromCharCode(...new Uint8Array(data)));
}

async function commitFile(repo, branch, path, content, sha, message, token) {
  const encoded = base64Encode(content);
  const body = { message, content: encoded, branch };
  if (sha) body.sha = sha;

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status}: ${err}`);
  }
  return await res.json();
}

async function resetBranch(repo, branch, sourceBranch, token) {
  const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${sourceBranch}`, { headers: headers(token) });
  const sha = (await refRes.json()).object.sha;
  const updateRes = await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ sha, force: true }),
  });
  if (!updateRes.ok) throw new Error(`Reset failed: ${await updateRes.text()}`);
}
window.GitHubService.resetBranch = resetBranch;
