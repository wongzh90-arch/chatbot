import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useWorkspaceStore = create(
    persist(
        (set) => ({
            currentRepo: '',
            currentBranch: 'main',
            githubToken: '',
            rememberKeys: false,
            setCurrentRepo: (repo) => set({ currentRepo: repo }),
            setCurrentBranch: (branch) => set({ currentBranch: branch }),
            setGithubToken: (token) => set({ githubToken: token }),
            setRememberKeys: (val) => set({ rememberKeys: val }),
        }),
        { name: 'workspace-storage', skipHydration: true }
    )
);
