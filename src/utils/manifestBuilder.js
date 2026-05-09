// src/utils/manifestBuilder.js
// Builds a dependency graph for all JavaScript files in a repository.
// Parses ES module imports/exports and creates a map:
//   { [filePath]: { exports: string[], imports: string[], importedBy: string[] } }

export class ManifestBuilder {
    /**
     * Build a manifest from an array of { path, content } objects.
     * @param {Array<{path: string, content: string}>} fileList
     * @returns {Object} manifest object
     */
    static buildFromFiles(fileList) {
        // 1. Extract raw exports & imports for each file
        const raw = {};
        for (const f of fileList) {
            raw[f.path] = {
                exports: this._extractExports(f.content),
                imports: this._extractImportPaths(f.content)
            };
        }

        // 2. Resolve relative imports to absolute paths (repo root)
        const entries = {};
        for (const [path, data] of Object.entries(raw)) {
            const resolvedImports = [];
            for (const imp of data.imports) {
                const resolved = this._resolveImportPath(imp, path);
                if (resolved) resolvedImports.push(resolved);
            }
            entries[path] = { exports: data.exports, imports: resolvedImports };
        }

        // 3. Compute importedBy (reverse dependency lookup)
        for (const [path, entry] of Object.entries(entries)) {
            entry.importedBy = [];
            for (const [otherPath, otherEntry] of Object.entries(entries)) {
                if (otherEntry.imports.includes(path)) {
                    entry.importedBy.push(otherPath);
                }
            }
        }

        return entries;
    }

    // ---- private helpers ----

    static _extractExports(code) {
        const exports = new Set();
        // export const/let/var/function/class foo
        const namedRegex = /export\s+(?:const|let|var|function|class)\s+(\w+)/g;
        let match;
        while ((match = namedRegex.exec(code)) !== null) {
            exports.add(match[1]);
        }
        // export { foo, bar }
        const braceRegex = /export\s*\{([^}]*)\}/g;
        while ((match = braceRegex.exec(code)) !== null) {
            match[1].split(',').forEach(name => {
                const clean = name.trim().split(' as ')[0].trim();
                if (clean) exports.add(clean);
            });
        }
        // export default
        if (/export\s+default\s+/.test(code)) {
            exports.add('default');
        }
        return [...exports];
    }

    static _extractImportPaths(code) {
        const paths = new Set();
        // import ... from './path'
        const fromRegex = /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
        let match;
        while ((match = fromRegex.exec(code)) !== null) {
            const importPath = match[1];
            // Only keep relative imports (start with .)
            if (importPath.startsWith('.')) {
                paths.add(importPath);
            }
        }
        return [...paths];
    }

    /**
     * Resolve a relative import path to an absolute repo path.
     * @param {string} importPath - e.g., './foo', '../bar'
     * @param {string} currentFilePath - e.g., 'src/components/Header.js'
     * @returns {string|null} absolute path (e.g., 'src/components/foo.js'), or null if unresolvable
     */
    static _resolveImportPath(importPath, currentFilePath) {
        if (!importPath.startsWith('.')) return null;
        const currentDir = currentFilePath.includes('/')
            ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/'))
            : '';
        const parts = importPath.split('/');
        const stack = currentDir ? currentDir.split('/') : [];
        for (const part of parts) {
            if (part === '.' || part === '') continue;
            if (part === '..') {
                stack.pop();
            } else {
                stack.push(part);
            }
        }
        let absolute = stack.join('/');
        // Auto‑append .js if no extension
        if (!/\.(js|jsx|mjs)$/.test(absolute)) {
            absolute += '.js';
        }
        return absolute;
    }
}
