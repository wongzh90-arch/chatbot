// js/utils/manifestParser.js
// Phase 1A - Static module manifest builder
// Uses regex-based export/import detection + optional LLM descriptions.

window.ManifestParser = (() => {

  // ----- Export detection -----
  // Matches `window.X =` assignments.
  // Excludes `window.window` and trivial cases.
  function extractExports(content) {
    const exportRegex = /window\.(\w+)\s*=/g;
    const names = new Set();
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      const name = match[1];
      if (name !== 'window') names.add(name);
    }
    return [...names];
  }

  // ----- Import detection (uses export set to filter) -----
  function extractImports(content, allExportsSet) {
    // Matches `window.X.` (or `window.X[`)
    const importRegex = /window\.(\w+)[\.\[]/g;
    const imports = new Set();
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const name = match[1];
      if (allExportsSet.has(name)) imports.add(name);
    }
    return [...imports];
  }

  // ----- Extract first meaningful comment line (JSDoc or //) -----
  function extractFirstComment(content) {
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // JSDoc start
      if (trimmed.startsWith('/**')) {
        // Grab text after /** until */ or end of next line
        let desc = trimmed.replace(/^\/\*\*\s*/, '');
        if (!desc.includes('*/')) {
          // might be multiline, find next line
          const idx = lines.indexOf(line);
          if (idx >= 0 && idx+1 < lines.length) {
            const next = lines[idx+1].trim().replace(/\*\/\s*$/, '').replace(/^\*\s*/, '');
            desc = desc + ' ' + next;
          }
        }
        desc = desc.replace(/\*\/\s*$/, '').trim();
        if (desc && desc.length > 3) return desc;
      }
      // Single line comment starting with `// Desc:` or just `// `
      if (trimmed.startsWith('// ') && trimmed.length > 3) {
        const desc = trimmed.replace(/^\/\/\s*/, '').trim();
        // Skip common license lines or blank
        if (!/^(?:Copyright|License|All rights reserved|jshint|global|file)/i.test(desc)) {
          return desc;
        }
      }
    }
    return null;
  }

  // ----- LLM batch description (optional) -----
  async function generateDescriptions(filesNeedingDesc, provider, model) {
    if (!provider || !model || filesNeedingDesc.length === 0) return {};
    const descriptions = {};
    // Batch up to 5 files per call
    for (let i = 0; i < filesNeedingDesc.length; i += 5) {
      const batch = filesNeedingDesc.slice(i, i+5);
      const promptLines = batch.map(f => `File: ${f.path}\nContent (first 500 chars):\n${f.content.slice(0, 500)}\n---`).join('\n');
      const system = 'You are a codebase analyst. For each file listed, provide exactly one concise sentence describing its role in the project. Format: "FILE: path" then the sentence. Do not explain anything else.';
      const userContent = `Describe each file in one sentence:\n\n${promptLines}`;
      try {
        const reply = await window.LLMProvider.chatCompletion({
          provider,
          model,
          messages: [],
          systemPrompt: system,
          userContent,
          thinkingMode: false,
        });
        // Parse each line: "FILE: path sentence"
        const lines = (reply.content || '').split('\n');
        for (const line of lines) {
          const match = line.match(/^FILE:\s*(\S+)\s+(.+)$/i);
          if (match) {
            descriptions[match[1]] = match[2].trim();
          }
        }
      } catch (e) {
        console.warn('Manifest LLM description failed', e);
        // continue without descriptions
      }
    }
    return descriptions;
  }

  // ----- Build manifest from file contents -----
  async function buildManifest(fileContents, provider, model) {
    // First pass: collect all exports
    const allExports = new Set();
    const exportMap = {}; // path -> exports string[]
    for (const file of fileContents) {
      const exports = extractExports(file.content);
      exportMap[file.path] = exports;
      exports.forEach(e => allExports.add(e));
    }

    // Second pass: imports
    const importMap = {}; // path -> imports string[]
    for (const file of fileContents) {
      importMap[file.path] = extractImports(file.content, allExports);
    }

    // Build entries
    const manifest = {};
    const descriptionsFromComment = {};
    const filesNeedingDesc = [];

    for (const file of fileContents) {
      const entry = {
        description: null,
        exports: exportMap[file.path],
        imports: importMap[file.path],
        importedBy: [],
        lineCount: file.content.split('\n').length,
        lastUpdated: new Date().toISOString(),
      };

      // Try to get description from comment
      const commentDesc = extractFirstComment(file.content);
      if (commentDesc) {
        entry.description = commentDesc;
      } else {
        filesNeedingDesc.push({ path: file.path, content: file.content });
      }

      manifest[file.path] = entry;
    }

    // LLM descriptions if provider supplied
    if (provider && filesNeedingDesc.length > 0) {
      const llmDescs = await generateDescriptions(filesNeedingDesc, provider, model);
      for (const [path, desc] of Object.entries(llmDescs)) {
        if (manifest[path]) manifest[path].description = desc;
      }
    }

    // Compute importedBy (cross-reference)
    for (const [path, entry] of Object.entries(manifest)) {
      entry.importedBy = [];
    }
    for (const [path, entry] of Object.entries(manifest)) {
      for (const imp of entry.imports) {
        // find which file exports this name
        for (const [p, e] of Object.entries(manifest)) {
          if (e.exports.includes(imp)) {
            if (!e.importedBy.includes(path)) e.importedBy.push(path);
          }
        }
      }
    }

    return manifest;
  }

  // ----- Update manifest entries for changed files -----
  function updateEntries(manifest, changedFiles) {
    // changedFiles: { [path]: newContent }
    // Recalculate exports, imports, and optionally descriptions.
    // Then recompute all importedBy relationships.

    const allExports = new Set();
    // first, collect existing exports from unchanged files
    for (const [path, entry] of Object.entries(manifest)) {
      if (!(path in changedFiles)) {
        entry.exports.forEach(e => allExports.add(e));
      }
    }

    for (const [path, newContent] of Object.entries(changedFiles)) {
      const newExports = extractExports(newContent);
      newExports.forEach(e => allExports.add(e));
      if (manifest[path]) {
        manifest[path].exports = newExports;
        manifest[path].lineCount = newContent.split('\n').length;
        manifest[path].lastUpdated = new Date().toISOString();
      } else {
        // new file
        manifest[path] = {
          description: null,
          exports: newExports,
          imports: [],
          importedBy: [],
          lineCount: newContent.split('\n').length,
          lastUpdated: new Date().toISOString(),
        };
      }
    }

    // Recalculate imports for changed files
    for (const [path, newContent] of Object.entries(changedFiles)) {
      manifest[path].imports = extractImports(newContent, allExports);
    }

    // Recompute importedBy for all entries (since imports may have changed)
    for (const path of Object.keys(manifest)) {
      manifest[path].importedBy = [];
    }
    for (const [path, entry] of Object.entries(manifest)) {
      for (const imp of entry.imports) {
        for (const [p, e] of Object.entries(manifest)) {
          if (e.exports.includes(imp)) {
            if (!e.importedBy.includes(path)) e.importedBy.push(path);
          }
        }
      }
    }

    return manifest;
  }

  return { buildManifest, updateEntries };
})();
