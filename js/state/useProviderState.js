// js/state/useProviderState.js
// Owns: provider, model selection, thinking mode, reasoning effort
// Persists to localStorage

window.useProviderState = function useProviderState() {
  const { useState, useEffect } = React;

  const DEEPSEEK_MODELS = [
    { value: 'deepseek-v4-flash', label: 'DeepSeek Flash (Fast)' },
    { value: 'deepseek-v4-pro',   label: 'DeepSeek Pro (Powerful)' },
  ];

  const [provider, setProvider] = useState(
    () => localStorage.getItem('PROVIDER') || 'deepseek'
  );
  const [thinkingMode, setThinkingMode] = useState(
    () => localStorage.getItem('THINKING_MODE') === 'true'
  );
  const [reasoningEffort, setReasoningEffort] = useState(
    () => localStorage.getItem('REASONING_EFFORT') || 'high'
  );
  const [openRouterModels, setOpenRouterModels] = useState(
    () => window.ModelRegistry ? window.ModelRegistry.FALLBACK_MODELS : []
  );
  const [modelsLoading, setModelsLoading] = useState(false);

  // Derive model list and default from provider
  const models = provider === 'deepseek' ? DEEPSEEK_MODELS : openRouterModels;

  const [selectedModel, setSelectedModel] = useState(() => {
    const stored = localStorage.getItem('OR_MODEL');
    if (provider === 'deepseek') {
      return (stored && DEEPSEEK_MODELS.some(m => m.value === stored))
        ? stored
        : 'deepseek-v4-flash';
    }
    return stored || 'openrouter/auto';
  });

  // Persist
  useEffect(() => { localStorage.setItem('PROVIDER', provider); }, [provider]);
  useEffect(() => { localStorage.setItem('THINKING_MODE', thinkingMode); }, [thinkingMode]);
  useEffect(() => { localStorage.setItem('REASONING_EFFORT', reasoningEffort); }, [reasoningEffort]);
  useEffect(() => { localStorage.setItem('OR_MODEL', selectedModel); }, [selectedModel]);

  // Fetch OpenRouter models on provider switch
  useEffect(() => {
    if (provider !== 'openrouter') return;
    setModelsLoading(true);
    window.ModelRegistry.fetchModels().then(m => {
      setOpenRouterModels(m);
      setModelsLoading(false);
    });
  }, [provider]);

  // When provider switches, reset model to a sensible default
  const handleSetProvider = (newProvider) => {
    setProvider(newProvider);
    if (newProvider === 'deepseek') {
      setSelectedModel('deepseek-v4-flash');
    } else {
      setSelectedModel(openRouterModels[0]?.value || 'openrouter/auto');
    }
  };

  return {
    provider,
    setProvider: handleSetProvider,
    selectedModel,
    setSelectedModel,
    thinkingMode,
    setThinkingMode,
    reasoningEffort,
    setReasoningEffort,
    models,
    modelsLoading,
    DEEPSEEK_MODELS,
  };
};
