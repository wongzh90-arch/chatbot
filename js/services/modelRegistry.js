window.ModelRegistry = (() => {
  // Hardcoded fallback that works without any API call
  const FALLBACK_MODELS = [
    { value: 'openrouter/auto',              label: 'Auto (Best Free)',           free: true },
    { value: 'anthropic/claude-3.5-sonnet',  label: 'Claude 3.5 Sonnet',          free: false },
    { value: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (Free)', free: true },
    { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Free)', free: true },
    { value: 'mistralai/mistral-7b-instruct:free',      label: 'Mistral 7B (Free)', free: true },
  ];

  async function fetchModels() {
    try {
      // Try to get live models from OpenRouter (no API key needed for this endpoint)
      const res = await fetch('https://openrouter.ai/api/v1/models');
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      return data.data.map(m => ({
        value: m.id,
        label: m.name || m.id,
        free: false,        // OpenRouter doesn’t expose free flag simply; you can guess from pricing
      }));
    } catch (e) {
      console.warn('Could not fetch live models, using fallback', e);
      return FALLBACK_MODELS;
    }
  }

  return { FALLBACK_MODELS, fetchModels };
})();
