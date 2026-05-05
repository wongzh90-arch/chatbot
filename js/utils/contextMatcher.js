window.ContextMatcher = (() => {

  function tokenize(str) {
    return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  }

  /**
   * Select the most relevant preferences for a given context.
   * @param {string[]} preferences
   * @param {string} context
   * @param {number} max
   * @returns {string[]}
   */
  function selectRelevant(preferences, context, max = 3) {
    if (!preferences.length) return [];

    const contextTokens = new Set(tokenize(context));
    const scored = preferences.map(pref => {
      const prefTokens = tokenize(pref);
      const overlap = prefTokens.filter(t => contextTokens.has(t)).length;
      // Give a tiny boost for longer preferences so they aren't penalised
      const score = overlap + prefTokens.length * 0.001;
      return { pref, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, max).map(s => s.pref);
  }

  return { selectRelevant };
})();
