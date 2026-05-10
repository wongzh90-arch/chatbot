/**
 * ContextBuilder – Builds a prompt context string by selecting target
 * and related files from a manifest, respecting a token budget.
 */
export class ContextBuilder {
    /**
     * Identify which files are needed.
     * @param {object} options
     * @param {string[]} options.targetFiles – list of target file paths
     * @param {object}  options.manifest    – manifest from ManifestBuilder
     * @param {number}  options.maxFiles    – max number of files (default 10)
     * @returns {string[]} – ordered list of paths
     */
    static identifyRequiredFiles({ targetFiles, manifest, maxFiles = 10 }) {
        if (!manifest) return targetFiles.slice(0, maxFiles);
        const selected = new Set(targetFiles);
        // Add direct imports of target files
        for (const f of targetFiles) {
            const entry = manifest[f];
            if (!entry) continue;
            (entry.imports || []).forEach(impName => {
                // manifest keys are paths; impName might be a variable name,
                // but manifestBuilder already resolves them to file paths.
                // We assume manifest entries are keyed by file path.
                if (manifest[impName]) selected.add(impName);
            });
        }
        // Add consumers (files that import target files)
        for (const f of targetFiles) {
            const entry = manifest[f];
            if (entry) (entry.importedBy || []).forEach(p => selected.add(p));
        }
        const result = Array.from(selected);
        const targetsFirst = targetFiles.filter(f => result.includes(f));
        const others = result.filter(f => !targetFiles.includes(f));
        return [...targetsFirst, ...others].slice(0, maxFiles);
    }

    /**
     * Build a string context with target files fully and related files
     * as interface-only (first 2000 chars).
     */
    static buildContext({ targetContents, relatedContents, manifest, tokenBudget = 20000 }) {
        let context = '## Target files (full content)\n';
        for (const f of targetContents) {
            context += `\n<file path="${f.path}">\n${f.content}\n</file>\n`;
        }
        if (relatedContents && relatedContents.length) {
            context += '\n## Related files (interface only)\n';
            for (const f of relatedContents) {
                const entry = manifest ? manifest[f.path] : null;
                const interfaceContent = entry ? f.content.slice(0, 2000) : f.content;
                context += `\n<file path="${f.path}" interface-only>\n${interfaceContent}\n</file>\n`;
            }
        }
        return { contextString: context, tokensUsed: context.length / 4 };
    }
}
