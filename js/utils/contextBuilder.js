// js/utils/contextBuilder.js
// Phase 1B — Smart context builder using static manifest.
// Replaces plain file-list injection with dependency-aware, token‑budgeted context.

window.ContextBuilder = (() => {

  // ---- Identify files needed for a task (prioritized) ----
  // targetFiles: array of paths that the task explicitly mentions.
  // manifest: module manifest (Phase 1A). Can be null.
  // maxFiles: maximum total files to list.
  function identifyRequiredFiles({ targetFiles, manifest, maxFiles = 10 }) {
    if (!manifest) return targetFiles.slice(0, maxFiles);

    const selected = new Set();

    // Priority 1: target files
    targetFiles.forEach(f => selected.add(f));

    // Priority 2: direct imports of target files
    for (const f of targetFiles) {
      const entry = manifest[f];
      if (!entry) continue;
      (entry.imports || []).forEach(impName => {
        // find which file exports this name
        for (const [p, e] of Object.entries(manifest)) {
          if (e.exports.includes(impName)) selected.add(p);
        }
      });
    }

    // Priority 3: files that import any target file (consumers)
    for (const f of targetFiles) {
      const entry = manifest[f];
      if (!entry) continue;
      (entry.importedBy || []).forEach(p => selected.add(p));
    }

    // Priority 4 (only if still room): two hops — imports of imports
    if (selected.size < maxFiles) {
      const currentSet = new Set(selected);
      for (const f of currentSet) {
        const entry = manifest[f];
        if (!entry) continue;
        (entry.imports || []).forEach(impName => {
          for (const [p, e] of Object.entries(manifest)) {
            if (e.exports.includes(impName)) selected.add(p);
          }
        });
        if (selected.size >= maxFiles) break;
      }
    }

    // Keep only first maxFiles, preserving priority order as best we can.
    // We want targets first, then others. The Set preserves insertion order.
    const result = [];
    for (const f of selected) {
      if (result.length >= maxFiles) break;
      result.push(f);
    }
    // Make sure targets are at the front.
    const targetsInResult = targetFiles.filter(f => result.includes(f));
    const others = result.filter(f => !targetFiles.includes(f));
    return [...targetsInResult, ...others].slice(0, maxFiles);
  }

  // ---- Token count approximation ----
  function estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  // ---- Extract interface (first lines after export) from a file ----
  function extractInterface(content, exportsList) {
    if (!exportsList || exportsList.length === 0) return content.slice(0, 2000);
    // Find the first occurrence of any exported name, then take max 2000 chars from there.
    let start = 0;
    for (const exp of exportsList) {
      const idx = content.indexOf(`window.${exp}`);
      if (idx !== -1) { start = idx; break; }
    }
    return content.slice(start, start + 2000);
  }

  // ---- Build final context string for LLM prompt ----
  // targetContents: array of { path, content } for files the task must change.
  // relatedContents: array of { path, content } for dependency files (may be null if not loaded).
  // manifest: optional manifest.
  // tokenBudget: maximum tokens (default 20000).
  // Returns an object { contextString, tokensUsed }.
  function buildContext({ targetContents, relatedContents, manifest, tokenBudget = 20000 }) {
    let context = '';
    let tokensUsed = 0;

    // Add target files (full content) as long as budget allows.
    context += '## Target files (full content)\n';
    for (const f of targetContents) {
      const block = `\n<file path="${f.path}">\n${f.content}\n</file>\n`;
      const tokens = estimateTokens(block);
      if (tokensUsed + tokens > tokenBudget) {
        // Truncate target file to fit budget? Better to include partial with warning.
        const available = tokenBudget - tokensUsed;
        const truncated = block.slice(0, available - 50); // 50 for warning
        context += truncated + '\n[... truncated due to token limit]\n</file>\n';
        tokensUsed = tokenBudget;
      } else {
        context += block;
        tokensUsed += tokens;
      }
    }

    // Add related files (interface only) if budget remains.
    const remainingBudget = tokenBudget - tokensUsed;
    if (remainingBudget > 500 && relatedContents && relatedContents.length > 0) {
      context += '\n## Related files (interface only)\n';
      for (const f of relatedContents) {
        if (!f || !f.content) continue;
        const entry = manifest ? manifest[f.path] : null;
        const interfaceContent = extractInterface(f.content, entry?.exports || []);
        const block = `\n<file path="${f.path}" interface-only>\n${interfaceContent}\n</file>\n`;
        const tokens = estimateTokens(block);
        if (tokensUsed + tokens > tokenBudget) break;
        context += block;
        tokensUsed += tokens;
      }
    }

    return { contextString: context, tokensUsed };
  }

  return { identifyRequiredFiles, buildContext, estimateTokens, extractInterface };
})();
