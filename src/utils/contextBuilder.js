export class ContextBuilder {
    static identifyRequiredFiles({ targetFiles, manifest, maxFiles = 10 }) {
        if (!manifest) return targetFiles.slice(0, maxFiles);
        const selected = new Set(targetFiles);
        // Add direct imports of target files
        for (const f of targetFiles) {
            const entry = manifest[f];
            if (!entry) continue;
            (entry.imports || []).forEach(impName => {
                for (const [p, e] of Object.entries(manifest)) {
                    if (e.exports.includes(impName)) selected.add(p);
                }
            });
        }
        // Add consumers
        for (const f of targetFiles) {
            const entry = manifest[f];
            if (entry) (entry.importedBy || []).forEach(p => selected.add(p));
        }
        const result = Array.from(selected);
        const targetsFirst = targetFiles.filter(f => result.includes(f));
        const others = result.filter(f => !targetFiles.includes(f));
        return [...targetsFirst, ...others].slice(0, maxFiles);
    }

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
        return { contextString: context, tokensUsed: context.length / 4};
    }
}
