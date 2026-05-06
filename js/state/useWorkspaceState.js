// js/state/useWorkspaceState.js
// Owns: GitHub token, repo, branch, workspace mode, deploy hook, rememberKeys
// Persists to localStorage or sessionStorage depending on rememberKeys

window.useWorkspaceState = function useWorkspaceState() {
  const { useState, useEffect } = React;

  const [rememberKeys, setRememberKeys] = useState(
    () => localStorage.getItem('REMEMBER_KEYS') === 'true'
  );

  // Storage tier — keys vs session
  const keyStorage  = rememberKeys ? localStorage : sessionStorage;
  const wsStorage   = rememberKeys ? localStorage : sessionStorage;

  const [githubToken, setGithubToken]   = useState(() => keyStorage.getItem('GH_TOKEN')      || '');
  const [deployHook,  setDeployHook]    = useState(() => keyStorage.getItem('DEPLOY_HOOK')    || '');
  const [workspace,   setWorkspace]     = useState(() => wsStorage.getItem('WORKSPACE')       || 'self');
  const [selfRepo,    setSelfRepo]      = useState(() => wsStorage.getItem('SELF_REPO')        || '');
  const [selfBranch,  setSelfBranch]    = useState(() => wsStorage.getItem('SELF_BRANCH')      || 'main');
  const [targetRepo,  setTargetRepo]    = useState(() => wsStorage.getItem('TARGET_REPO')      || '');
  const [targetBranch,setTargetBranch]  = useState(() => wsStorage.getItem('TARGET_BRANCH')    || 'main');
  const [systemPromptOverride, setSystemPromptOverride] = useState(
    () => keyStorage.getItem('SYSPROMPT') || ''
  );

  // Derived
  const currentRepo   = workspace === 'self' ? selfRepo   : targetRepo;
  const currentBranch = workspace === 'self' ? selfBranch : targetBranch;

  const setCurrentRepo = (v) => workspace === 'self' ? setSelfRepo(v)   : setTargetRepo(v);
  const setCurrentBranch = (v) => workspace === 'self' ? setSelfBranch(v) : setTargetBranch(v);

  // Persist
  useEffect(() => { localStorage.setItem('REMEMBER_KEYS', rememberKeys); }, [rememberKeys]);
  useEffect(() => { keyStorage.setItem('GH_TOKEN',   githubToken);         }, [githubToken,   rememberKeys]);
  useEffect(() => { keyStorage.setItem('DEPLOY_HOOK', deployHook);         }, [deployHook,    rememberKeys]);
  useEffect(() => { keyStorage.setItem('SYSPROMPT',  systemPromptOverride); }, [systemPromptOverride, rememberKeys]);
  useEffect(() => {
    wsStorage.setItem('WORKSPACE',      workspace);
    wsStorage.setItem('SELF_REPO',      selfRepo);
    wsStorage.setItem('SELF_BRANCH',    selfBranch);
    wsStorage.setItem('TARGET_REPO',    targetRepo);
    wsStorage.setItem('TARGET_BRANCH',  targetBranch);
  }, [workspace, selfRepo, selfBranch, targetRepo, targetBranch, rememberKeys]);

  return {
    rememberKeys, setRememberKeys,
    githubToken,  setGithubToken,
    deployHook,   setDeployHook,
    workspace,    setWorkspace,
    selfRepo,     setSelfRepo,
    selfBranch,   setSelfBranch,
    targetRepo,   setTargetRepo,
    targetBranch, setTargetBranch,
    currentRepo,  setCurrentRepo,
    currentBranch,setCurrentBranch,
    systemPromptOverride, setSystemPromptOverride,
  };
};
