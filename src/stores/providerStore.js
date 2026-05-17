import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useProviderStore = create(
    persist(
        (set) => ({
            provider: 'deepseek',
            selectedModel: 'deepseek-v4-flash',
            thinkingMode: false,
            reasoningEffort: 'high',
            setProvider: (p) => set({ provider: p, selectedModel: p === 'deepseek' ? 'deepseek-v4-flash' : 'openrouter/auto' }),
            setSelectedModel: (m) => set({ selectedModel: m }),
            setThinkingMode: (v) => set({ thinkingMode: v }),
            setReasoningEffort: (e) => set({ reasoningEffort: e }),
        }),
        { name: 'provider-storage', skipHydration: true }
    )
);
