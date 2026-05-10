/**
 * manifestUpdater – Incrementally updates manifest.json after code changes.
 * Re‑parses exports/imports of modified files with static regex (no LLM),
 * then recomputes importedBy for the whole manifest.
 */
import { ManifestBuilder } from '../utils/manifestBuilder.js';

export class ManifestUpdater {
    static update(oldManifest, changedFiles) {
        const updated = { ...oldManifest };

        for (const [path, newContent] of Object.entries(changedFiles)) {
            if (!/\.(js|jsx)$/i.test(path)) continue;

            const entry = updated[path] || {};
            const newExports = ManifestBuilder._extractExports(newContent);
            const newImports = ManifestBuilder._extractImportPaths(newContent)
                .map(imp => ManifestBuilder._resolveImportPath(imp, path))
                .filter(Boolean);

            const oldLineCount = entry.lineCount || 0;
            const newLineCount = newContent.split('\n').length;
            const descNeedsRefresh = oldLineCount === 0 ? true :
                Math.abs(newLineCount - oldLineCount) / Math.max(oldLineCount, 1) > 0.3;

            updated[path] = {
                ...entry,
                exports: newExports,
                imports: newImports,
                lineCount: newLineCount,
                lastUpdated: new Date().toISOString(),
                description: descNeedsRefresh || !entry.description
                    ? `[needs refresh] ${entry.description || ''}`
                    : entry.description
            };
        }

        // Recompute importedBy for all files
        for (const [filePath, entry] of Object.entries(updated)) {
            entry.importedBy = [];
            for (const [otherPath, otherEntry] of Object.entries(updated)) {
                if (otherPath !== filePath && otherEntry.imports?.includes(filePath)) {
                    entry.importedBy.push(otherPath);
                }
            }
        }

        return updated;
    }
}
